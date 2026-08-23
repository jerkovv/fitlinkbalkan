-- Upis treninga bez telefona: kardio dobija minute, plan red dobija prave reps.
--
-- 1) KARDIO JE DO SADA PROLAZIO, ALI SE NIJE VIDEO. Vezba na minute je dobijala
-- tri serije reps/kg kao i svaka druga; triger trg_cardio_single_set bi sets
-- pribio na 1, duration_minutes bi ostao NULL na obe strane, pa je detalj
-- treninga pokazivao znacku "3/1" i tri reda "Serija N: -". Sada se minuti
-- upisuju i u plan red i u set_logs, a visestruka serija za kardio se odbija
-- otvoreno umesto da se tiho izgubi.
--
-- 2) PLAN RED JE UPISIVAO TVRDO '0'. Kolona je NOT NULL, pa se nije mogla
-- ostaviti prazna, a '0' nije NULL - detalj je ispisivao "Plan: 3 x 0". Upisan
-- trening nema plan; najbliza istina je ono sto je odradjeno u prvoj seriji.
CREATE OR REPLACE FUNCTION public.trainer_create_past_workout(
  p_athlete_id uuid, p_started_at timestamp with time zone, p_duration_minutes integer,
  p_exercises jsonb, p_title text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_kardio boolean;
  v_min int;
  v_reps text;
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

    SELECT COALESCE(e.is_duration_based, false) INTO v_kardio
    FROM public.exercises e WHERE e.id = (v_vezba->>'exercise_id')::uuid;

    -- Kardio se meri minutima, ne serijama, i triger trg_cardio_single_set svakako
    -- pribija sets na 1. Da upis ne bi tiho izgubio serije, ovde se to trazi otvoreno.
    IF v_kardio AND jsonb_array_length(v_vezba->'sets') <> 1 THEN
      RAISE EXCEPTION 'Kardio vezba se upisuje kao jedna stavka sa minutima';
    END IF;

    v_min := NULLIF((v_vezba->'sets'->0->>'duration_minutes'), '')::int;

    -- Plan reda je do sada bio tvrdo '0', pa je detalj treninga ispisivao
    -- besmisleno "Plan: 3 x 0". Upisan trening nema plan; najbliza istina je ono
    -- sto je stvarno odradjeno u prvoj seriji.
    v_reps := COALESCE(NULLIF(v_vezba->'sets'->0->>'reps', ''), '0');

    -- Vezbe zive UZ SESIJU (day_id NULL), isto kao kad ih trener doda usred
    -- slobodnog treninga. Program vezbaca se ovim ne dira.
    INSERT INTO public.assigned_program_exercises
      (session_log_id, exercise_id, position, sets, reps, rest_seconds, duration_minutes)
    VALUES
      (v_session, (v_vezba->>'exercise_id')::uuid, v_poz,
       jsonb_array_length(v_vezba->'sets'), v_reps,
       COALESCE((v_vezba->>'rest_seconds')::int, 90),
       CASE WHEN v_kardio THEN v_min END)
    RETURNING id INTO v_ape;

    v_sn := 0;
    FOR v_serija IN SELECT * FROM jsonb_array_elements(v_vezba->'sets')
    LOOP
      v_sn := v_sn + 1;
      v_ukupno_serija := v_ukupno_serija + 1;
      INSERT INTO public.set_logs
        (session_log_id, exercise_id, set_number, reps, weight_kg, rpe,
         duration_minutes, done, started_at, completed_at, logged_by_trainer)
      VALUES
        (v_session, v_ape, v_sn,
         NULLIF((v_serija->>'reps')::int, 0),
         (v_serija->>'weight_kg')::numeric,
         (v_serija->>'rpe')::numeric,
         NULLIF((v_serija->>'duration_minutes'), '')::int,
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
$function$;

REVOKE ALL ON FUNCTION public.trainer_create_past_workout(uuid, timestamptz, integer, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_create_past_workout(uuid, timestamptz, integer, jsonb, text, text) TO authenticated;

-- Brojevi iz forme se ZAOKRUZUJU umesto da se strogo kastuju, i kardio minuti
-- dobijaju opseg.
--
-- Strog kast teksta u int znaci da "20,5" u polju Minuti obara CEO upis sa 22P02
-- ("invalid input syntax for type integer"), a ta greska ne kaze ni koje je polje
-- krivo. Klijent to sada proverava, ali RPC je javna kapija - svaki sledeci
-- pozivalac bi naleteo na isto. Zaokruzivanje je ovde tacnije od odbijanja:
-- pola ponavljanja ne postoji, pola minuta se ne meri.
--
-- Uz to, provera kardija je do sada gledala samo BROJ stavki, pa je red bez
-- minuta (NULL, 0, negativan) prolazio i zavrsavao kao vezba bez ijednog broja.
DO $mig$
DECLARE v_src text; v_new text; v_args text;
BEGIN
  SELECT p.prosrc, pg_get_function_arguments(p.oid) INTO v_src, v_args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'trainer_create_past_workout';

  v_new := replace(v_src,
'    v_min := NULLIF((v_vezba->''sets''->0->>''duration_minutes''), '''')::int;',
'    v_min := round(NULLIF((v_vezba->''sets''->0->>''duration_minutes''), '''')::numeric)::int;
    IF v_kardio AND (v_min IS NULL OR v_min < 1 OR v_min > 600) THEN
      RAISE EXCEPTION ''Minuti kardio vezbe moraju biti izmedju 1 i 600'';
    END IF;');
  IF v_new = v_src THEN RAISE EXCEPTION 'obrazac v_min nije nadjen'; END IF;

  v_src := v_new;
  v_new := replace(v_src,
'    v_reps := COALESCE(NULLIF(v_vezba->''sets''->0->>''reps'', ''''), ''0'');',
'    v_reps := COALESCE(
      round(NULLIF(v_vezba->''sets''->0->>''reps'', '''')::numeric)::int::text, ''0'');');
  IF v_new = v_src THEN RAISE EXCEPTION 'obrazac v_reps nije nadjen'; END IF;

  v_src := v_new;
  v_new := replace(v_src,
'         NULLIF((v_serija->>''reps'')::int, 0),',
'         NULLIF(round(NULLIF(v_serija->>''reps'', '''')::numeric)::int, 0),');
  IF v_new = v_src THEN RAISE EXCEPTION 'obrazac reps u set_logs nije nadjen'; END IF;

  v_src := v_new;
  v_new := replace(v_src,
'         NULLIF((v_serija->>''duration_minutes''), '''')::int,',
'         round(NULLIF((v_serija->>''duration_minutes''), '''')::numeric)::int,');
  IF v_new = v_src THEN RAISE EXCEPTION 'obrazac duration_minutes u set_logs nije nadjen'; END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.trainer_create_past_workout(%s)
     RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %L',
    v_args, v_new);
END $mig$;
