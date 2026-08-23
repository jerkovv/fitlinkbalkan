-- SUPERSET, drugi sloj: pauza od nula sekundi, i kolona koja prezivi kopiranje.
--
-- 1) PAUZA 0 DANAS NIJE IZRAZIVA. _engine_complete_set bezuslovno prelazi u
-- current_state='rest', pa bi i nula znacila "pauza" - samo prazna. Unutar
-- superset kruga se ne odmara, pa nula mora da znaci "idi odmah dalje".
DO $$
DECLARE v_src text; v_new text; v_args text;
BEGIN
  SELECT p.prosrc, pg_get_function_arguments(p.oid) INTO v_src, v_args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = '_engine_complete_set';

  v_new := replace(v_src,
'  UPDATE public.workout_live_state
  SET current_state=''rest'',',
'  -- Pauza 0 = bez pauze (sledeca vezba u superset krugu ide odmah). Bez ovoga
  -- bi vezbac usred kruga dobio prazno odbrojavanje umesto sledece vezbe.
  UPDATE public.workout_live_state
  SET current_state = CASE WHEN COALESCE(v_rest, 0) > 0 THEN ''rest'' ELSE ''active'' END,');

  IF v_new = v_src THEN
    RAISE EXCEPTION '_engine_complete_set: obrazac za stanje nije nadjen';
  END IF;

  v_new := replace(v_new,
'      rest_ends_at=now() + (v_rest || '' seconds'')::interval,',
'      rest_ends_at = CASE WHEN COALESCE(v_rest, 0) > 0
                          THEN now() + (v_rest || '' seconds'')::interval END,');

  v_new := replace(v_new,
'  RETURN jsonb_build_object(''success'', true, ''state'', ''rest'', ''rest_seconds'', v_rest, ''position'', v_next);',
'  RETURN jsonb_build_object(
    ''success'', true,
    ''state'', CASE WHEN COALESCE(v_rest, 0) > 0 THEN ''rest'' ELSE ''active'' END,
    ''rest_seconds'', v_rest, ''position'', v_next);');

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public._engine_complete_set(%s)
     RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %L',
    v_args, v_new);
END $$;

-- 2) KOLONA MORA DA PREZIVI KOPIRANJE. Prenos sablon -> dodeljeno -> sesija ide
-- preko EKSPLICITNIH spiskova kolona; svaka nova kolona koja se ne doda tiho
-- nestane. Bez ovoga bi trener napravio superset u sablonu, dodelio program i
-- superset bi nestao - najgora vrsta greske, jer nista ne pukne.
DO $$
DECLARE v_src text; v_new text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = '_fork_session_plan';

  v_new := replace(v_src,
'      (id, day_id, session_log_id, forked_from, exercise_id, position, sets, reps,
       weight_kg, rest_seconds, notes, deleted_at, duration_minutes)
    SELECT s.novi_id, NULL, p_session_id, s.id, s.exercise_id, s.position, s.sets, s.reps,
           s.weight_kg, s.rest_seconds, s.notes, s.deleted_at, s.duration_minutes',
'      (id, day_id, session_log_id, forked_from, exercise_id, position, sets, reps,
       weight_kg, rest_seconds, notes, deleted_at, duration_minutes, superset_group)
    SELECT s.novi_id, NULL, p_session_id, s.id, s.exercise_id, s.position, s.sets, s.reps,
           s.weight_kg, s.rest_seconds, s.notes, s.deleted_at, s.duration_minutes, s.superset_group');

  IF v_new = v_src THEN
    RAISE EXCEPTION '_fork_session_plan: spisak kolona nije nadjen';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public._fork_session_plan(p_session_id uuid)
     RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %L', v_new);
END $$;

DO $$
DECLARE v_src text; v_new text; v_args text;
BEGIN
  SELECT p.prosrc, pg_get_function_arguments(p.oid) INTO v_src, v_args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'assign_program_to_athlete';

  v_new := replace(v_src,
'        (day_id, exercise_id, position, sets, reps, weight_kg, rest_seconds, duration_minutes)
      VALUES
        (v_new_day_id, v_ex.exercise_id, v_ex.position, v_ex.sets, v_ex.reps, v_ex.weight_kg, v_ex.rest_seconds, v_ex.duration_minutes)',
'        (day_id, exercise_id, position, sets, reps, weight_kg, rest_seconds, duration_minutes, superset_group)
      VALUES
        (v_new_day_id, v_ex.exercise_id, v_ex.position, v_ex.sets, v_ex.reps, v_ex.weight_kg, v_ex.rest_seconds, v_ex.duration_minutes, v_ex.superset_group)');

  IF v_new = v_src THEN
    RAISE EXCEPTION 'assign_program_to_athlete: spisak kolona nije nadjen';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.assign_program_to_athlete(%s)
     RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %L',
    v_args, v_new);
END $$;

-- Citaci plana nose superset_group, da klijent moze da nacrta krug.
DO $$
DECLARE r record; v_new text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, p.prosrc, pg_get_function_arguments(p.oid) AS args, p.provolatile
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_session_plan_full', 'get_workout_day_full')
  LOOP
    v_new := replace(r.prosrc,
      $q$      'position', ape.position,$q$,
      $q$      'position', ape.position,
      'superset_group', ape.superset_group,$q$);
    IF v_new = r.prosrc THEN
      RAISE EXCEPTION '%: obrazac za position nije nadjen', r.proname;
    END IF;
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.%I(%s)
       RETURNS jsonb LANGUAGE plpgsql %s SECURITY DEFINER SET search_path TO ''public'' AS %L',
      r.proname, r.args,
      CASE r.provolatile WHEN 's' THEN 'STABLE' WHEN 'i' THEN 'IMMUTABLE' ELSE '' END,
      v_new);
  END LOOP;
END $$;
