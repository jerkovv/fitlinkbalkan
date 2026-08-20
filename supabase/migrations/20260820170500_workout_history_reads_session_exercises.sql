-- Istorija treninga mora da pokaze sta je TOG DANA radjeno, a ne sta u planu
-- stoji danas. Isti obrazac kao kod sata i telefona.
DO $$
DECLARE v_src text; v_new text; v_vol char; v_args text;
BEGIN
  SELECT p.prosrc, p.provolatile, pg_get_function_identity_arguments(p.oid)
    INTO v_src, v_vol, v_args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_inapp_workout_detail';

  v_new := replace(v_src,
    'WHERE ape.day_id = v_day_id',
    'WHERE (CASE WHEN EXISTS (SELECT 1 FROM public.assigned_program_exercises z
                              WHERE z.session_log_id = p_session_id)
                 THEN ape.session_log_id = p_session_id
                 ELSE ape.day_id = v_day_id END)');

  IF v_new = v_src THEN
    RAISE EXCEPTION 'get_inapp_workout_detail: obrazac nije nadjen, funkcija nije menjana';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.get_inapp_workout_detail(%s)
     RETURNS jsonb LANGUAGE plpgsql %s SECURITY DEFINER SET search_path TO ''public'' AS %L',
    v_args,
    CASE v_vol WHEN 's' THEN 'STABLE' WHEN 'i' THEN 'IMMUTABLE' ELSE '' END,
    v_new);
END $$;
