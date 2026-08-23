-- Vezba koju je trener dodao pa obrisao u toku istog treninga vise se ne vidi u
-- zavrsenom treningu.
--
-- Brisanje je oduvek bilo ispravno (soft delete, deleted_at), i svi ostali citaci
-- plana filtriraju - get_session_plan_full i watch_compute_position oba imaju
-- "ape.deleted_at IS NULL". get_inapp_workout_detail je jedini propusten, pa je
-- obrisana vezba dobijala punu karticu sa "0/3" i praznim spiskom serija.
-- Podaci su bili ispravni; lagao je samo citac, pa nema sta da se backfiluje.
--
-- PAZNJA za buducu izmenu: filter NE SME u EXISTS sondu ispod. Ta sonda odgovara
-- na pitanje "da li je plan racvan", a ne "ima li jos zivih vezbi". Sa filterom
-- bi sesija kojoj su SVE forkovane vezbe obrisane pala u ELSE granu i vaskrsla
-- ceo sablon dana - gore od greske koja se ovde popravlja.
DO $$
DECLARE v_src text; v_new text; v_args text; v_vol char;
BEGIN
  SELECT p.prosrc, pg_get_function_arguments(p.oid), p.provolatile
    INTO v_src, v_args, v_vol
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_inapp_workout_detail';

  v_new := replace(v_src,
'    WHERE (CASE WHEN EXISTS (SELECT 1 FROM public.assigned_program_exercises z
                              WHERE z.session_log_id = p_session_id)
                 THEN ape.session_log_id = p_session_id
                 ELSE ape.day_id = v_day_id END)',
'    WHERE ape.deleted_at IS NULL
      AND (CASE WHEN EXISTS (SELECT 1 FROM public.assigned_program_exercises z
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
