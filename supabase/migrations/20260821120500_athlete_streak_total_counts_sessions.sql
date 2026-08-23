-- "Ukupno treninga" kod vezbaca broji SESIJE, ne dane.
--
-- Brojac je do sada rastao uz petlju po DISTINCT danima, pa su dva treninga
-- istog dana bila jedan. Dve posledice: trenerov ekran (get_athlete_stats,
-- count(*)) i vezbacev su prikazivali razlicite brojeve pod istim nazivom
-- "Ukupno treninga", a trening koji trener naknadno upise za vezbaca koji je
-- tog dana vec trenirao ne bi uvecao nista.
--
-- Nizovi (current/longest/weeks) ostaju po DANIMA - to je i smisao niza.
DO $mig$
DECLARE v_src text; v_new text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_athlete_streak';

  v_new := replace(v_src,
'  LOOP
    v_total := v_total + 1;
    IF v_prev IS NULL OR r.d - v_prev = 1 THEN',
'  LOOP
    IF v_prev IS NULL OR r.d - v_prev = 1 THEN');
  IF v_new = v_src THEN RAISE EXCEPTION 'get_athlete_streak: petlja po danima nije nadjena'; END IF;

  v_src := v_new;
  v_new := replace(v_src,
'  SELECT MAX(completed_at) INTO v_last
  FROM public.workout_session_logs
  WHERE athlete_id = p_athlete_id AND completed_at IS NOT NULL;',
'  -- Ukupno je broj SESIJA, ne dana: dva treninga istog dana su dva treninga.
  SELECT count(*), MAX(completed_at) INTO v_total, v_last
  FROM public.workout_session_logs
  WHERE athlete_id = p_athlete_id AND completed_at IS NOT NULL;');
  IF v_new = v_src THEN RAISE EXCEPTION 'get_athlete_streak: upit za v_last nije nadjen'; END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.get_athlete_streak(p_athlete_id uuid)
     RETURNS TABLE(current_streak_days integer, longest_streak_days integer,
                   weeks_streak integer, total_workouts integer,
                   last_workout_at timestamp with time zone)
     LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''public'' AS %L',
    v_new);
END $mig$;
