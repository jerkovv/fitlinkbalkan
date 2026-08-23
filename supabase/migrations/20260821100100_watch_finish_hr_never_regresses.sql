-- Isto pravilo i na satovoj putanji zavrsetka (_engine_finish_workout).
--
-- Ovde je bilo jos labavije nego na telefonskoj: obican COALESCE bez NULLIF, pa
-- je i nula mogla da prodje kao vrednost. Telo se prepisuje programski, da se
-- ostatak funkcije (finalizacija, provere) ne dira, i pukne glasno ako obrazac
-- nije nadjen umesto da tiho ne uradi nista.
--
-- pg_get_function_ARGUMENTS, ne identity_arguments: ove funkcije imaju
-- podrazumevane vrednosti parametara, a identity oblik ih odbacuje, pa bi
-- CREATE OR REPLACE pao na "cannot remove parameter defaults".
DO $$
DECLARE v_src text; v_new text; v_args text;
BEGIN
  SELECT p.prosrc, pg_get_function_arguments(p.oid) INTO v_src, v_args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = '_engine_finish_workout';

  v_new := replace(v_src,
'    SET active_calories = COALESCE(p_active_calories, active_calories),
        live_hr_avg = COALESCE(p_hr_avg, live_hr_avg),
        live_hr_max = COALESCE(p_hr_max, live_hr_max),
        hr_series = COALESCE(p_hr_series, hr_series)',
'    -- Max samo raste; serija se ne menja siromasnijom. Bez ovoga poslednji
    -- pisac pobedjuje, pa kratak rep pojede punu seriju drugog uredjaja.
    SET active_calories = COALESCE(NULLIF(p_active_calories, 0), active_calories),
        live_hr_avg = CASE
          WHEN live_hr_avg IS NULL
            OR jsonb_typeof(hr_series) IS DISTINCT FROM ''array''
            OR (p_hr_series IS NOT NULL AND jsonb_typeof(p_hr_series) = ''array''
                AND jsonb_array_length(p_hr_series) > jsonb_array_length(hr_series))
          THEN COALESCE(NULLIF(p_hr_avg, 0), live_hr_avg)
          ELSE live_hr_avg END,
        live_hr_max = GREATEST(
          COALESCE(live_hr_max, 0),
          COALESCE(NULLIF(p_hr_max, 0), 0),
          COALESCE((
            SELECT max(CASE WHEN jsonb_typeof(e) = ''array'' THEN (e->>1)::numeric
                            ELSE (e->>''bpm'')::numeric END)::int
            FROM jsonb_array_elements(COALESCE(p_hr_series, ''[]''::jsonb)) e
          ), 0)
        ),
        hr_series = CASE
          WHEN p_hr_series IS NULL OR jsonb_typeof(p_hr_series) <> ''array'' THEN hr_series
          WHEN jsonb_typeof(hr_series) IS DISTINCT FROM ''array''
            OR jsonb_array_length(p_hr_series) > jsonb_array_length(hr_series) THEN p_hr_series
          ELSE hr_series END');

  IF v_new = v_src THEN
    RAISE EXCEPTION '_engine_finish_workout: obrazac nije nadjen, funkcija nije menjana';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public._engine_finish_workout(%s)
     RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %L',
    v_args, v_new);
END $$;

-- watch_report_metrics je za max vec bio ispravan, ali je seriju prepisivao isto
-- kao ostali. Sada i on cuva bogatiju.
DO $$
DECLARE v_src text; v_new text; v_args text;
BEGIN
  SELECT p.prosrc, pg_get_function_arguments(p.oid) INTO v_src, v_args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'watch_report_metrics';

  v_new := replace(v_src,
    'hr_series = COALESCE(p_hr_series, hr_series)',
    'hr_series = CASE
          WHEN p_hr_series IS NULL OR jsonb_typeof(p_hr_series) <> ''array'' THEN hr_series
          WHEN jsonb_typeof(hr_series) IS DISTINCT FROM ''array''
            OR jsonb_array_length(p_hr_series) > jsonb_array_length(hr_series) THEN p_hr_series
          ELSE hr_series END');

  IF v_new = v_src THEN
    RAISE EXCEPTION 'watch_report_metrics: obrazac nije nadjen, funkcija nije menjana';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.watch_report_metrics(%s)
     RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %L',
    v_args, v_new);
END $$;
