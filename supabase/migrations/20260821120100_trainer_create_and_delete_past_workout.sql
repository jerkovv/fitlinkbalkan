-- Upis celog treninga unazad, u JEDNOJ transakciji.
--
-- p_exercises je niz oblika:
--   [{ "exercise_id": uuid, "rest_seconds": 90,
--      "sets": [{ "reps": 10, "weight_kg": 50, "rpe": 8 }, ...] }, ...]
-- Redosled u nizu je redosled u treningu.
CREATE OR REPLACE FUNCTION public.trainer_create_past_workout(
  p_athlete_id       uuid,
  p_started_at       timestamptz,
  p_duration_minutes integer,
  p_exercises        jsonb,
  p_title            text DEFAULT NULL,
  p_notes            text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_trener uuid := auth.uid();
  v_session uuid;
  v_vezbi int;
  v_vezba jsonb;
  v_ape uuid;
  v_poz int := 0;
  v_serija jsonb;
  v_sn int;
  v_ukupno_serija int := 0;
BEGIN
  PERFORM public._trainer_offline_guard(p_athlete_id);

  IF p_started_at IS NULL OR p_started_at > now() THEN
    RAISE EXCEPTION 'Trening ne moze da bude u buducnosti';
  END IF;
  IF p_started_at < now() - interval '90 days' THEN
    RAISE EXCEPTION 'Trening stariji od 90 dana se ne upisuje';
  END IF;
  IF p_duration_minutes IS NULL OR p_duration_minutes < 1 OR p_duration_minutes > 600 THEN
    RAISE EXCEPTION 'Trajanje mora biti izmedju 1 i 600 minuta';
  END IF;

  IF p_exercises IS NULL OR jsonb_typeof(p_exercises) <> 'array' THEN
    RAISE EXCEPTION 'Nije prosledjena nijedna vezba';
  END IF;
  v_vezbi := jsonb_array_length(p_exercises);
  IF v_vezbi < 1 THEN RAISE EXCEPTION 'Nije prosledjena nijedna vezba'; END IF;
  IF v_vezbi > 30 THEN RAISE EXCEPTION 'Najvise 30 vezbi po treningu'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_exercises) x
    WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = (x->>'exercise_id')::uuid)
  ) THEN
    RAISE EXCEPTION 'Nepoznata vezba';
  END IF;

  -- Zastita od dvostrukog slanja: isti vezbac, isti trener, isti minut pocetka.
  -- Namerno NIJE po danu - trener sme da upise dva treninga istog dana.
  IF EXISTS (
    SELECT 1 FROM public.workout_session_logs s
    WHERE s.athlete_id = p_athlete_id
      AND s.entered_by_trainer = v_trener
      AND date_trunc('minute', s.started_at) = date_trunc('minute', p_started_at)
  ) THEN
    RAISE EXCEPTION 'Trening sa istim pocetkom je vec upisan';
  END IF;

  -- ZAVRSENA OD RODJENJA: is_active=false, completed_at popunjen, i NIJEDAN red
  -- u workout_live_state. Otud je nedodirljiva za sve zive trenerove RPC-eve.
  INSERT INTO public.workout_session_logs
    (athlete_id, started_at, completed_at, duration_seconds, is_active,
     entered_by_trainer, entry_title, notes)
  VALUES
    (p_athlete_id, p_started_at, p_started_at + make_interval(mins => p_duration_minutes),
     p_duration_minutes * 60, false, v_trener, NULLIF(btrim(COALESCE(p_title, '')), ''), p_notes)
  RETURNING id INTO v_session;

  FOR v_vezba IN SELECT * FROM jsonb_array_elements(p_exercises)
  LOOP
    v_poz := v_poz + 1;

    IF jsonb_typeof(v_vezba->'sets') <> 'array'
       OR jsonb_array_length(v_vezba->'sets') < 1
       OR jsonb_array_length(v_vezba->'sets') > 12 THEN
      RAISE EXCEPTION 'Svaka vezba mora imati izmedju 1 i 12 serija';
    END IF;

    -- Vezbe zive UZ SESIJU (day_id NULL), isto kao kad ih trener doda usred
    -- slobodnog treninga. Program vezbaca se ovim ne dira.
    INSERT INTO public.assigned_program_exercises
      (session_log_id, exercise_id, position, sets, reps, rest_seconds)
    VALUES
      (v_session, (v_vezba->>'exercise_id')::uuid, v_poz,
       jsonb_array_length(v_vezba->'sets'), '0',
       COALESCE((v_vezba->>'rest_seconds')::int, 90))
    RETURNING id INTO v_ape;

    v_sn := 0;
    FOR v_serija IN SELECT * FROM jsonb_array_elements(v_vezba->'sets')
    LOOP
      v_sn := v_sn + 1;
      v_ukupno_serija := v_ukupno_serija + 1;
      INSERT INTO public.set_logs
        (session_log_id, exercise_id, set_number, reps, weight_kg, rpe,
         done, started_at, completed_at, logged_by_trainer)
      VALUES
        (v_session, v_ape, v_sn,
         NULLIF((v_serija->>'reps')::int, 0),
         (v_serija->>'weight_kg')::numeric,
         (v_serija->>'rpe')::numeric,
         true, p_started_at, p_started_at, true);
    END LOOP;
  END LOOP;

  UPDATE public.workout_session_logs
  SET total_volume_kg = (
    SELECT COALESCE(sum(COALESCE(reps,0) * COALESCE(weight_kg,0)), 0)
    FROM public.set_logs WHERE session_log_id = v_session AND done = true
  )
  WHERE id = v_session;

  RETURN v_session;
END;
$$;

-- Brisanje upisanog treninga. Bez ovoga je prva omaska vecna: na
-- workout_session_logs ne postoji nijedna DELETE politika, pa se red ne moze
-- ukloniti kroz PostgREST. Brise se ISKLJUCIVO trening koji je trener sam upisao;
-- ono sto je vezbac odradio ostaje nedodirljivo.
CREATE OR REPLACE FUNCTION public.trainer_delete_past_workout(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_ath uuid; v_ko uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni'; END IF;

  SELECT athlete_id, entered_by_trainer INTO v_ath, v_ko
  FROM public.workout_session_logs WHERE id = p_session_id;

  IF v_ath IS NULL THEN RAISE EXCEPTION 'Trening ne postoji'; END IF;
  IF v_ko IS NULL THEN
    RAISE EXCEPTION 'Ovaj trening je odradio vezbac - ne brise se odavde';
  END IF;
  IF NOT public.is_my_athlete(v_uid, v_ath) THEN
    RAISE EXCEPTION 'Nije tvoj vezbac';
  END IF;

  -- set_logs i vezbe sesije odlaze kaskadno (oba imaju ON DELETE CASCADE).
  DELETE FROM public.workout_session_logs WHERE id = p_session_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.trainer_create_past_workout(uuid, timestamptz, integer, jsonb, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trainer_create_past_workout(uuid, timestamptz, integer, jsonb, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.trainer_delete_past_workout(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trainer_delete_past_workout(uuid) TO authenticated;
