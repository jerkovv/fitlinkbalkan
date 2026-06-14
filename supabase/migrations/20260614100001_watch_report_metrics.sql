-- Novi RPC: sat upisuje finalne metrike (kalorije + HR) i na VEC ZAVRSENU sesiju
-- (auto-finish preko poslednje serije zatvori sesiju pre nego sto sat posalje
-- kalorije). GREATEST stiti od kasne nule. Bez is_active kapije.
-- Vec primenjeno na bazu preko MCP; ovaj fajl je samo za version control.

CREATE OR REPLACE FUNCTION public.watch_report_metrics(p_token text, p_session_id uuid, p_active_calories integer DEFAULT NULL::integer, p_hr_avg integer DEFAULT NULL::integer, p_hr_max integer DEFAULT NULL::integer, p_hr_series jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_rows integer;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.watch_pairing_tokens
  WHERE token = p_token AND revoked_at IS NULL AND expires_at > now();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  -- NEMA is_active kapije: metrike se mogu upisati i na vec zavrsenu sesiju
  -- (auto-finish preko poslednje serije zavrsi sesiju pre nego sto sat posalje kalorije).
  UPDATE public.workout_session_logs
  SET active_calories = CASE WHEN p_active_calories IS NOT NULL
                             THEN GREATEST(COALESCE(active_calories, 0), p_active_calories)
                             ELSE active_calories END,
      live_hr_avg = COALESCE(p_hr_avg, live_hr_avg),
      live_hr_max = CASE WHEN p_hr_max IS NOT NULL
                         THEN GREATEST(COALESCE(live_hr_max, 0), p_hr_max)
                         ELSE live_hr_max END,
      hr_series = COALESCE(p_hr_series, hr_series)
  WHERE id = p_session_id AND athlete_id = v_user_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  RETURN jsonb_build_object('success', true);
END $function$
;

GRANT EXECUTE ON FUNCTION public.watch_report_metrics(text,uuid,integer,integer,integer,jsonb) TO anon, authenticated;
