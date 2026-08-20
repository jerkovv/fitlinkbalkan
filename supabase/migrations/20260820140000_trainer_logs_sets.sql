-- Trener upisuje kilazu i ponavljanja umesto vezbaca, i ispravlja ono sto je
-- vezbac upisao.
--
-- Pravilo: trenerov upis je konacan (vezbac ga NE moze promeniti), vezbacev
-- trener sme da menja.
--
-- Prva polovina pravila vec vazi bez ijedne izmene: vezbacev jedini put upisa je
-- _engine_complete_set, koji radi ON CONFLICT ... DO NOTHING, a klijent nigde ne
-- pise direktno u set_logs (samo cita). Kolona logged_by_trainer je tu da se ZNA
-- ciji je zapis - da UI moze da pokaze da je broj uneo trener.

ALTER TABLE public.set_logs
  ADD COLUMN IF NOT EXISTS logged_by_trainer boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public._trainer_session_guard(p_session_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_athlete uuid; v_day uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni'; END IF;
  PERFORM public.require_active_trainer_sub();

  SELECT s.athlete_id, s.day_id INTO v_athlete, v_day
  FROM public.workout_session_logs s
  WHERE s.id = p_session_id AND s.is_active = true;

  IF v_athlete IS NULL THEN RAISE EXCEPTION 'Trening nije aktivan'; END IF;
  IF NOT public.is_my_athlete(v_uid, v_athlete) THEN
    RAISE EXCEPTION 'Nije tvoj vezbac';
  END IF;
  IF v_day IS NULL THEN RAISE EXCEPTION 'Slobodan trening nema vezbe'; END IF;

  RETURN v_athlete;
END;
$$;

-- A) Trener belezi seriju koju je vezbac upravo odradio.
--
-- Set se NE bira slobodno nego se uzima SLEDECI na redu (watch_compute_position),
-- isto kao kad vezbac sam zavrsi seriju. Razlog je konkretan: pozicija se izvodi
-- iz BROJA upisanih serija (done_count < sets), ne iz set_number. Upis "serije 5"
-- dok su odradjene dve bi napravio red sa set_number=5 dok brojac kaze 3, i
-- vezbac bi zaglavio na setu koji vec postoji a nikad se ne "zavrsi".
CREATE OR REPLACE FUNCTION public.trainer_log_next_set(
  p_session_id       uuid,
  p_reps             integer DEFAULT NULL,
  p_weight           numeric DEFAULT NULL,
  p_rpe              numeric DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_athlete uuid;
  v_pos jsonb;
  v_next jsonb;
  v_rest int;
BEGIN
  v_athlete := public._trainer_session_guard(p_session_id);

  v_pos := public.watch_compute_position(p_session_id);
  IF (v_pos->>'complete')::boolean THEN
    RETURN jsonb_build_object('success', true, 'state', 'completed', 'note', 'already_done');
  END IF;

  -- DO UPDATE (ne DO NOTHING kao kod vezbaca): ako je vezbac u istoj sekundi
  -- upisao isti set, trenerov broj je taj koji ostaje.
  INSERT INTO public.set_logs (
    session_log_id, exercise_id, set_number, reps, weight_kg, rpe,
    duration_minutes, done, started_at, completed_at, logged_by_trainer
  )
  VALUES (
    p_session_id, (v_pos->>'ape_id')::uuid, (v_pos->>'set_number')::int,
    CASE WHEN p_duration_minutes IS NOT NULL THEN NULL
         ELSE COALESCE(p_reps, (v_pos->>'planned_reps')::int) END,
    CASE WHEN p_duration_minutes IS NOT NULL THEN NULL
         ELSE COALESCE(p_weight, (v_pos->>'planned_weight')::numeric, 0) END,
    p_rpe, p_duration_minutes, true, now(), now(), true
  )
  ON CONFLICT (session_log_id, exercise_id, set_number) DO UPDATE
    SET reps = EXCLUDED.reps,
        weight_kg = EXCLUDED.weight_kg,
        rpe = EXCLUDED.rpe,
        duration_minutes = EXCLUDED.duration_minutes,
        done = true,
        completed_at = now(),
        logged_by_trainer = true;

  v_rest := (v_pos->>'rest_seconds')::int;
  v_next := public.watch_compute_position(p_session_id);

  IF (v_next->>'complete')::boolean THEN
    PERFORM public._finalize_workout_session(p_session_id);
    RETURN jsonb_build_object('success', true, 'state', 'completed', 'position', v_next);
  END IF;

  -- Isti upis zivog reda kao u _engine_complete_set: vezbacev telefon i sat
  -- pomere se na sledeci set kao da je sam kliknuo.
  UPDATE public.workout_live_state
  SET current_state='rest',
      current_exercise_idx=(v_next->>'exercise_idx')::int,
      current_set_number=(v_next->>'set_number')::int,
      current_exercise_name=v_next->>'exercise_name',
      total_sets=(v_next->>'total_sets')::int,
      rest_ends_at=now() + (v_rest || ' seconds')::interval,
      last_heartbeat=now()
  WHERE session_log_id=p_session_id AND athlete_id=v_athlete;

  RETURN jsonb_build_object('success', true, 'state', 'rest',
                            'rest_seconds', v_rest, 'position', v_next);
END;
$$;

-- B) Trener ispravlja vec upisanu seriju (svoju ili vezbacevu).
--
-- Samo UPDATE postojeceg reda - broj upisanih serija se ne menja, pa pozicija
-- vezbaca ostaje gde jeste.
CREATE OR REPLACE FUNCTION public.trainer_update_set(
  p_session_id           uuid,
  p_assigned_exercise_id uuid,
  p_set_number           integer,
  p_reps                 integer DEFAULT NULL,
  p_weight               numeric DEFAULT NULL,
  p_rpe                  numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_rows int;
BEGIN
  PERFORM public._trainer_session_guard(p_session_id);

  UPDATE public.set_logs
  SET reps = COALESCE(p_reps, reps),
      weight_kg = COALESCE(p_weight, weight_kg),
      rpe = COALESCE(p_rpe, rpe),
      logged_by_trainer = true
  WHERE session_log_id = p_session_id
    AND exercise_id = p_assigned_exercise_id
    AND set_number = p_set_number;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Ta serija nije upisana';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.trainer_log_next_set(uuid, integer, numeric, numeric, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trainer_log_next_set(uuid, integer, numeric, numeric, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.trainer_update_set(uuid, uuid, integer, integer, numeric, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trainer_update_set(uuid, uuid, integer, integer, numeric, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public._trainer_session_guard(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._trainer_session_guard(uuid) TO authenticated;
