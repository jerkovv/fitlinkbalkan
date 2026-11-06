-- Kalorije kao Apple Watch.
-- 1) Slobodan trening i trening pre prve vezbe racunaju se kao trening snage (0,67), kao
--    trening iz programa; puni obracun (1) dobija samo vezba na vreme (kardio).
-- 2) Prekid signala do 5 min se popunjava prosekom pulsa pre i posle prekida (Apple Watch
--    tako popunjava rupe); do 30 s kao i do sada, a duzi od 5 min racuna samo 30 s.
-- Vazi od sada; zavrseni treninzi se ne menjaju (njihov broj je vec upisan i u Zdravlje).

CREATE OR REPLACE FUNCTION public._kcal_za_period(p_athlete uuid, p_hr integer, p_hr_pre integer, p_session uuid, p_sekundi numeric)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_sekundi IS NULL OR p_sekundi <= 0 THEN 0
    WHEN p_sekundi <= 30 THEN public._kcal_u_minutu(p_athlete, p_hr, p_session) * p_sekundi / 60
    WHEN p_sekundi <= 300 THEN public._kcal_u_minutu(p_athlete,
           CASE WHEN p_hr_pre BETWEEN 30 AND 250 THEN round((p_hr + p_hr_pre) / 2.0)::int ELSE p_hr END,
           p_session) * p_sekundi / 60
    ELSE public._kcal_u_minutu(p_athlete, p_hr, p_session) * 30 / 60
  END;
$function$;
REVOKE EXECUTE ON FUNCTION public._kcal_za_period(uuid, integer, integer, uuid, numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._kcal_vezba_snage(p_session uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Tekuca vezba odlucuje (vezba na vreme = kardio); bez vezbe (slobodan trening,
  -- pre prve vezbe) vazi trening snage, kao Apple Watch "Trening snage".
  SELECT COALESCE((
    SELECT NOT COALESCE(e.is_duration_based, false)
    FROM public.workout_live_state wls
    JOIN public.workout_session_logs s ON s.id = wls.session_log_id
    JOIN LATERAL (
      SELECT ape.exercise_id
      FROM public.assigned_program_exercises ape
      WHERE ape.deleted_at IS NULL
        AND (CASE WHEN EXISTS (SELECT 1 FROM public.assigned_program_exercises z
                               WHERE z.session_log_id = wls.session_log_id)
                  THEN ape.session_log_id = wls.session_log_id
                  ELSE ape.day_id = s.day_id END)
      ORDER BY ape.position OFFSET wls.current_exercise_idx LIMIT 1
    ) t ON true
    JOIN public.exercises e ON e.id = t.exercise_id
    WHERE wls.session_log_id = p_session
      AND wls.current_exercise_idx IS NOT NULL
  ), true);
$function$;

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
  v_puls_ok boolean;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;

  v_source := CASE WHEN p_source = 'sensor' THEN 'sensor' ELSE 'phone' END;
  v_puls_ok := p_hr BETWEEN 30 AND 250;

  UPDATE public.workout_live_state
  SET last_heartbeat = now(),
      current_hr = COALESCE(p_hr, current_hr),
      hr_last_at = CASE WHEN p_hr IS NOT NULL THEN now() ELSE hr_last_at END,
      hr_source  = CASE WHEN p_hr IS NOT NULL THEN v_source ELSE hr_source END,
      -- Tacka za "HR poslednjih 10 min" kod trenera (vidi _hr_recent_append).
      hr_recent  = public._hr_recent_append(hr_recent, p_hr),
      -- Traka racuna uvek; puls sa telefona samo dok sat cuti (sat inace racuna sam).
      current_active_calories = COALESCE(current_active_calories, 0) + CASE
        WHEN v_puls_ok AND kcal_at IS NOT NULL
             AND (v_source = 'sensor' OR watch_last_hr_at IS NULL OR watch_last_hr_at < now() - interval '40 seconds')
          THEN public._kcal_za_period(v_user_id, p_hr, current_hr, p_session_id,
                                  extract(epoch FROM now() - kcal_at))
        ELSE 0
      END,
      kcal_at = CASE
        WHEN v_puls_ok
             AND (v_source = 'sensor' OR watch_last_hr_at IS NULL OR watch_last_hr_at < now() - interval '40 seconds')
          THEN now()
        ELSE kcal_at
      END
  WHERE session_log_id = p_session_id
    AND athlete_id = v_user_id
    AND current_state IN ('active','rest')
  RETURNING (watch_last_hr_at IS NOT NULL AND watch_last_hr_at >= now() - interval '40 seconds')
    INTO v_sat_ziv;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 AND v_puls_ok AND NOT COALESCE(v_sat_ziv, false) THEN
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

CREATE OR REPLACE FUNCTION public.watch_update_workout_hr(p_token text, p_heart_rate integer, p_session_id uuid, p_active_calories numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_rows_updated integer;
  v_kcal numeric := CASE WHEN p_active_calories > 0 THEN p_active_calories END;
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
      current_active_calories = COALESCE(current_active_calories, 0) + CASE
        WHEN hr_source = 'sensor' AND hr_last_at > now() - interval '20 seconds' THEN 0
        -- Sat meri: samo prirast od poslednjeg javljanja (restart sata ne oduzima).
        WHEN v_kcal IS NOT NULL THEN GREATEST(v_kcal - COALESCE(watch_kcal_poslednje, 0), 0)
        -- Sat jos nije javio kalorije: procena iz njegovog pulsa.
        WHEN watch_kcal_poslednje IS NULL AND kcal_at IS NOT NULL
          THEN public._kcal_za_period(v_user_id, p_heart_rate, current_hr, p_session_id,
                                  extract(epoch FROM now() - kcal_at))
        ELSE 0
      END,
      watch_kcal_poslednje = COALESCE(v_kcal, watch_kcal_poslednje),
      kcal_at = CASE
        WHEN hr_source = 'sensor' AND hr_last_at > now() - interval '20 seconds' THEN kcal_at
        ELSE now()
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
