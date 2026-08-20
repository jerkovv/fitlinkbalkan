-- Sat mora da vidi isti plan kao telefon. Izmena je samo izvor redova u CTE
-- "plan": vezbe treninga ako postoje, inace sablon dana. Telo se prepisuje
-- programski nad postojecim izvorom, da se ostatak funkcije ne dira - i pukne
-- glasno ako obrazac nije nadjen, umesto da tiho ne uradi nista.
DO $$
DECLARE v_src text; v_new text; v_vol char;
BEGIN
  SELECT p.prosrc, p.provolatile INTO v_src, v_vol
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'watch_get_workout_plan';

  v_new := replace(v_src,
    'WHERE ape.day_id = v_day_id
      AND ape.deleted_at IS NULL',
    'WHERE ape.deleted_at IS NULL
      AND (CASE WHEN EXISTS (SELECT 1 FROM public.assigned_program_exercises z
                             WHERE z.session_log_id = p_session_id)
                THEN ape.session_log_id = p_session_id
                ELSE ape.day_id = v_day_id END)');

  IF v_new = v_src THEN
    RAISE EXCEPTION 'watch_get_workout_plan: obrazac nije nadjen, funkcija nije menjana';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.watch_get_workout_plan(p_token text, p_session_id uuid)
     RETURNS jsonb LANGUAGE plpgsql %s SECURITY DEFINER SET search_path TO ''public'' AS %L',
    CASE v_vol WHEN 's' THEN 'STABLE' WHEN 'i' THEN 'IMMUTABLE' ELSE '' END,
    v_new);
END $$;
