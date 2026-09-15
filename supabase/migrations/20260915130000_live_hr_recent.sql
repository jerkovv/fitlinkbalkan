-- "HR poslednjih 10 min" kod trenera je citao workout_session_logs.hr_series, a to se
-- tokom treninga puni samo sa trakom (athlete_heartbeat). Sat salje seriju tek na kraju
-- (watch_report_metrics), pa je sa samo satom grafik bio prazan.
--
-- Zivo stanje sad nosi hr_recent: tacke {ts, bpm} poslednjih 10 minuta, najvise jedna na
-- 10 s (mali realtime payload). Puni ga izvor koji je i u current_hr: traka kad je sveza,
-- inace sat. hr_series se ne dira, pa konacna serija uredjaja ostaje netaknuta.

ALTER TABLE public.workout_live_state
  ADD COLUMN IF NOT EXISTS hr_recent jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public._hr_recent_append(p_recent jsonb, p_hr integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH postojece AS (
    SELECT CASE WHEN jsonb_typeof(p_recent) = 'array' THEN p_recent ELSE '[]'::jsonb END AS niz
  ),
  tacke AS (
    SELECT e, ord,
           CASE WHEN (e->>'ts') ~ '^\d{4}-\d{2}-\d{2}T' THEN (e->>'ts')::timestamptz END AS ts
    FROM postojece, jsonb_array_elements(niz) WITH ORDINALITY AS t(e, ord)
  )
  SELECT CASE
    WHEN p_hr IS NULL OR p_hr NOT BETWEEN 30 AND 250 THEN (SELECT niz FROM postojece)
    -- Najvise jedna tacka na 10 s.
    WHEN (SELECT max(ts) FROM tacke) > now() - interval '10 seconds' THEN (SELECT niz FROM postojece)
    ELSE COALESCE((
      SELECT jsonb_agg(e ORDER BY ord) FROM tacke WHERE ts >= now() - interval '10 minutes'
    ), '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
         'ts', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'bpm', p_hr))
  END;
$$;

REVOKE EXECUTE ON FUNCTION public._hr_recent_append(jsonb, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.watch_update_workout_hr(p_token text, p_heart_rate integer, p_session_id uuid, p_active_calories numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_rows_updated integer;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.watch_pairing_tokens
  WHERE token = p_token
    AND revoked_at IS NULL
    AND expires_at > now();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  IF p_heart_rate < 30 OR p_heart_rate > 250 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_hr');
  END IF;

  PERFORM 1 FROM public.workout_session_logs
  WHERE id = p_session_id
    AND athlete_id = v_user_id
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_ended');
  END IF;

  UPDATE public.workout_live_state
  SET current_hr = CASE
        WHEN hr_source = 'sensor' AND hr_last_at > now() - interval '20 seconds'
          THEN current_hr
        ELSE p_heart_rate
      END,
      hr_last_at = CASE
        WHEN hr_source = 'sensor' AND hr_last_at > now() - interval '20 seconds'
          THEN hr_last_at
        ELSE now()
      END,
      hr_source = CASE
        WHEN hr_source = 'sensor' AND hr_last_at > now() - interval '20 seconds'
          THEN hr_source
        ELSE 'watch'
      END,
      -- Isti izbor izvora kao current_hr: dok je traka sveza, grafik crta nju.
      hr_recent = CASE
        WHEN hr_source = 'sensor' AND hr_last_at > now() - interval '20 seconds'
          THEN hr_recent
        ELSE public._hr_recent_append(hr_recent, p_heart_rate)
      END,
      current_active_calories = CASE
        WHEN p_active_calories IS NOT NULL AND p_active_calories >= 0
          THEN p_active_calories
        ELSE current_active_calories
      END,
      last_heartbeat = now(),
      watch_last_hr_at = now()
  WHERE session_log_id = p_session_id
    AND athlete_id = v_user_id
    AND current_state IN ('active','rest');

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_live_session');
  END IF;

  RETURN jsonb_build_object('success', true);
END $function$;

CREATE OR REPLACE FUNCTION public.athlete_heartbeat(p_session_id uuid, p_hr integer DEFAULT NULL::integer, p_source text DEFAULT NULL::text, p_calories numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_rows int;
  v_source text;
  v_sat_ziv boolean;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;

  v_source := CASE WHEN p_source = 'sensor' THEN 'sensor' ELSE 'phone' END;

  UPDATE public.workout_live_state
  SET last_heartbeat = now(),
      current_hr = COALESCE(p_hr, current_hr),
      hr_last_at = CASE WHEN p_hr IS NOT NULL THEN now() ELSE hr_last_at END,
      hr_source  = CASE WHEN p_hr IS NOT NULL THEN v_source ELSE hr_source END,
      -- Tacka za "HR poslednjih 10 min" kod trenera (vidi _hr_recent_append).
      hr_recent  = public._hr_recent_append(hr_recent, p_hr),
      current_active_calories = CASE
        WHEN p_calories IS NOT NULL
             AND p_calories >= 0
             AND v_source = 'sensor'
             AND (watch_last_hr_at IS NULL OR watch_last_hr_at < now() - interval '40 seconds')
          THEN p_calories
        ELSE current_active_calories
      END
  WHERE session_log_id = p_session_id
    AND athlete_id = v_user_id
    AND current_state IN ('active','rest')
  RETURNING (watch_last_hr_at IS NOT NULL AND watch_last_hr_at >= now() - interval '40 seconds')
    INTO v_sat_ziv;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 AND p_hr BETWEEN 30 AND 250 AND NOT COALESCE(v_sat_ziv, false) THEN
    UPDATE public.workout_session_logs s
    -- {ts, bpm} kao telefon i sat.
    SET hr_series = (CASE WHEN jsonb_typeof(s.hr_series) = 'array' THEN s.hr_series ELSE '[]'::jsonb END)
                    || jsonb_build_array(jsonb_build_object(
                         'ts', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                         'bpm', p_hr)),
        live_hr_max = GREATEST(COALESCE(s.live_hr_max, 0), p_hr),
        live_hr_min = LEAST(COALESCE(s.live_hr_min, p_hr), p_hr),
        live_hr_avg = round(
          (COALESCE(s.live_hr_avg, p_hr)::numeric
             * (CASE WHEN jsonb_typeof(s.hr_series) = 'array' THEN jsonb_array_length(s.hr_series) ELSE 0 END)
           + p_hr)
          / ((CASE WHEN jsonb_typeof(s.hr_series) = 'array' THEN jsonb_array_length(s.hr_series) ELSE 0 END) + 1)
        )::int
    WHERE s.id = p_session_id
      AND s.athlete_id = v_user_id
      AND s.is_active = true;
  END IF;

  RETURN jsonb_build_object('success', v_rows > 0);
END
$function$;
