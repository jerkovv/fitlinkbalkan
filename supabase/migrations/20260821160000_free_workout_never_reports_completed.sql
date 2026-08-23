-- Slobodan trening se NE zavrsava sam - ni kad trener obrise ostatak spiska.
--
-- Dve rupe, obe se vide u istom toku: vezbac odradi prvu vezbu, trener obrise
-- preostale tri.
--
-- 1) ZIVI RED JE OSTAJAO NA OBRISANOJ VEZBI. _trainer_resync_live je, kad
-- izmena zavrsi spisak, samo podizao plan_version i ostavljao
-- current_exercise_name / idx / set_number / total_sets da pokazuju na vezbu
-- koje vise nema. Telefon i sat su onda i dalje crtali tu vezbu i nudili
-- "Završio set". Motor na svojoj putanji ta polja uredno cisti - ovde nije.
--
-- 2) "VEC ZAVRSENO" JE ODGOVARALO SA 'completed'. Rani izlaz iz
-- _engine_complete_set vraca 'completed' cim je pozicija gotova. Za trening sa
-- planom je to tacno, za slobodan nije: tamo gotov SPISAK nije gotov TRENING, a
-- 'completed' je rec koju svaki klijent cita kao kraj. Sada vraca
-- 'free_plan_done', isto kao i redovna putanja.
DO $mig$
DECLARE v_src text; v_new text; v_args text;
BEGIN
  ---------------------------------------------------------------- 1
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = '_trainer_resync_live';

  v_new := replace(v_src,
'  IF (v_next->>''complete'')::boolean THEN
    UPDATE public.workout_live_state
    SET plan_version = plan_version + 1
    WHERE session_log_id = p_session_id AND athlete_id = p_athlete;
    RETURN jsonb_build_object(''success'', true, ''state'', ''plan_complete'');
  END IF;',
'  IF (v_next->>''complete'')::boolean THEN
    -- Slobodan trening: spisak je gotov, trening traje. Polja tekuce vezbe se
    -- MORAJU ocistiti, inace telefon i sat ostaju na vezbi koje vise nema.
    -- Isto sto radi i motor kad vezbac sam dodje do kraja spiska.
    IF (SELECT s.day_id FROM public.workout_session_logs s
         WHERE s.id = p_session_id) IS NULL THEN
      UPDATE public.workout_live_state
      SET current_state = ''active'',
          rest_ends_at = NULL,
          current_exercise_name = NULL,
          current_exercise_idx = NULL,
          current_set_number = NULL,
          total_sets = 0,
          plan_version = plan_version + 1
      WHERE session_log_id = p_session_id AND athlete_id = p_athlete;
      RETURN jsonb_build_object(''success'', true, ''state'', ''free_plan_done'');
    END IF;

    UPDATE public.workout_live_state
    SET plan_version = plan_version + 1
    WHERE session_log_id = p_session_id AND athlete_id = p_athlete;
    RETURN jsonb_build_object(''success'', true, ''state'', ''plan_complete'');
  END IF;');
  IF v_new = v_src THEN RAISE EXCEPTION '_trainer_resync_live: obrazac nije nadjen'; END IF;

  SELECT pg_get_function_arguments(p.oid) INTO v_args FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = '_trainer_resync_live';

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public._trainer_resync_live(%s)
     RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %L',
    v_args, v_new);

  ---------------------------------------------------------------- 2
  SELECT p.prosrc, pg_get_function_arguments(p.oid) INTO v_src, v_args FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = '_engine_complete_set';

  v_new := replace(v_src,
'  v_pos := public.watch_compute_position(p_session_id);
  IF (v_pos->>''complete'')::boolean THEN
    RETURN jsonb_build_object(''success'', true, ''state'', ''completed'', ''note'', ''already_done'');
  END IF;',
'  v_pos := public.watch_compute_position(p_session_id);
  IF (v_pos->>''complete'')::boolean THEN
    -- Slobodan trening: gotov SPISAK nije gotov TRENING. ''completed'' je rec
    -- koju svaki klijent cita kao kraj, pa se tu ne sme reci.
    RETURN jsonb_build_object(''success'', true, ''note'', ''already_done'',
      ''state'', CASE WHEN v_day IS NULL THEN ''free_plan_done'' ELSE ''completed'' END);
  END IF;');
  IF v_new = v_src THEN RAISE EXCEPTION '_engine_complete_set: obrazac nije nadjen'; END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public._engine_complete_set(%s)
     RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %L',
    v_args, v_new);
END $mig$;
