-- Sat je slobodan trening odbijao sa 'session_not_found'.
--
-- Uzrok je bio spajanje dva razlicita pitanja u jednu proveru: funkcija je
-- ucitavala day_id i onda NULL tumacila kao "sesija ne postoji". Otkad slobodan
-- trening sme da ima vezbe, day_id NULL je sasvim legitimno stanje, pa se
-- postojanje sesije mora proveriti odvojeno.
DO $$
DECLARE v_src text; v_new text; v_vol char;
BEGIN
  SELECT p.prosrc, p.provolatile INTO v_src, v_vol
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'watch_get_workout_plan';

  v_new := replace(v_src,
    '  SELECT day_id INTO v_day_id
  FROM public.workout_session_logs
  WHERE id = p_session_id
    AND athlete_id = v_user_id;

  IF v_day_id IS NULL THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''session_not_found'');
  END IF;',
    '  -- day_id NULL je legitiman (slobodan trening), pa postojanje sesije ide
  -- kroz zaseban FOUND, ne kroz vrednost day_id.
  SELECT day_id INTO v_day_id
  FROM public.workout_session_logs
  WHERE id = p_session_id
    AND athlete_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''session_not_found'');
  END IF;');

  IF v_new = v_src THEN
    RAISE EXCEPTION 'watch_get_workout_plan: obrazac nije nadjen, funkcija nije menjana';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.watch_get_workout_plan(p_token text, p_session_id uuid)
     RETURNS jsonb LANGUAGE plpgsql %s SECURITY DEFINER SET search_path TO ''public'' AS %L',
    CASE v_vol WHEN 's' THEN 'STABLE' WHEN 'i' THEN 'IMMUTABLE' ELSE '' END,
    v_new);
END $$;
