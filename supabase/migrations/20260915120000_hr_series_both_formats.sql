-- Puls treninga u aplikaciji stize u dva oblika: [[sekunde, bpm], ...] (stari zapis i
-- server tokom treninga sa trakom) i [{ts, bpm}, ...] (telefon i sat, sa trakom i sa
-- satom). Zone (_compute_hr_zones) i grafikon u detalju treninga citali su samo prvi,
-- pa treninzi zapisani drugim oblikom nisu imali ni zone ni grafikon pulsa.
--
-- Detalj sad oba oblika svodi na [[sekunde od pocetka, bpm], ...], a heartbeat
-- dopisuje {ts, bpm} kao telefon i sat, da mini grafikon kod trenera uzivo radi.

CREATE OR REPLACE FUNCTION public._normalize_hr_series(p_series jsonb, p_started_at timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_array(x.t, x.bpm) ORDER BY x.t), '[]'::jsonb)
  FROM (
    -- Vise tacaka u istoj sekundi (1 Hz uz milisekunde): ostaje jedna, najvisa.
    SELECT DISTINCT ON (raw.t) raw.t, raw.bpm
    FROM (
      SELECT
        CASE
          WHEN jsonb_typeof(e) = 'array' AND (e->>0) ~ '^[0-9]+(\.[0-9]+)?$'
            THEN round((e->>0)::numeric)::int
          WHEN jsonb_typeof(e) = 'object' AND p_started_at IS NOT NULL
               AND (e->>'ts') ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}'
            THEN round(extract(epoch from ((e->>'ts')::timestamptz - p_started_at)))::int
        END AS t,
        CASE
          WHEN jsonb_typeof(e) = 'array' AND (e->>1) ~ '^[0-9]+(\.[0-9]+)?$'
            THEN round((e->>1)::numeric)::int
          WHEN jsonb_typeof(e) = 'object' AND (e->>'bpm') ~ '^[0-9]+(\.[0-9]+)?$'
            THEN round((e->>'bpm')::numeric)::int
        END AS bpm
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(p_series) = 'array' THEN p_series ELSE '[]'::jsonb END
           ) AS e
    ) raw
    WHERE raw.t IS NOT NULL AND raw.t >= 0 AND raw.bpm BETWEEN 30 AND 250
    ORDER BY raw.t, raw.bpm DESC
  ) x;
$$;

REVOKE EXECUTE ON FUNCTION public._normalize_hr_series(jsonb, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_inapp_workout_detail(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_athlete uuid;
  v_day_id uuid;
  v_result jsonb;
  v_exercises jsonb;
  v_cfg_max int;
  v_birth_year int;
  v_max_hr int;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT athlete_id, day_id INTO v_athlete, v_day_id
  FROM public.workout_session_logs WHERE id = p_session_id;
  IF v_athlete IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_caller <> v_athlete AND NOT EXISTS (
    SELECT 1 FROM public.athletes a WHERE a.id = v_athlete AND a.trainer_id = v_caller
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  -- Max puls za zone: rucno podeseno ako postoji, inace 220 minus godine, inace fallback 190
  SELECT max_hr INTO v_cfg_max FROM public.user_hr_config WHERE user_id = v_athlete AND max_hr > 0;
  SELECT birth_year INTO v_birth_year FROM public.athletes WHERE id = v_athlete;
  v_max_hr := COALESCE(
    v_cfg_max,
    CASE WHEN v_birth_year IS NOT NULL AND v_birth_year > 1900
         THEN 220 - (EXTRACT(YEAR FROM now())::int - v_birth_year)
         ELSE 190 END
  );
  IF v_max_hr IS NULL OR v_max_hr < 100 THEN v_max_hr := 190; END IF;

  -- Spisak vezbi sa planom (sazetak + per-set ciljevi) i uradjenim serijama
  SELECT jsonb_agg(ex_row ORDER BY ex_pos) INTO v_exercises
  FROM (
    SELECT ape.position AS ex_pos,
      jsonb_build_object(
        'exercise_name', COALESCE(e.name, 'Vezba'),
        'superset_group', ape.superset_group,
        'planned_sets', ape.sets,
        'planned_reps', ape.reps,
        'planned_weight_kg', ape.weight_kg,
        'planned_duration_minutes', ape.duration_minutes,
        'is_duration_based', COALESCE(e.is_duration_based, false),
        'planned_set_details', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'set_number', aps.set_number,
            'reps', aps.reps,
            'weight_kg', aps.weight_kg,
            'rest_seconds', aps.rest_seconds
          ) ORDER BY aps.set_number)
          FROM public.assigned_program_exercise_sets aps
          WHERE aps.assigned_exercise_id = ape.id
        ), '[]'::jsonb),
        'sets', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'set_number', sl.set_number,
            'reps', sl.reps,
            'weight_kg', sl.weight_kg,
            'rpe', sl.rpe,
            'duration_minutes', sl.duration_minutes,
            'done', sl.done
          ) ORDER BY sl.set_number)
          FROM public.set_logs sl
          WHERE sl.session_log_id = p_session_id AND sl.exercise_id = ape.id
        ), '[]'::jsonb),
        'done_count', (
          SELECT count(*) FROM public.set_logs sl
          WHERE sl.session_log_id = p_session_id AND sl.exercise_id = ape.id AND sl.done = true
        )
      ) AS ex_row
    FROM public.assigned_program_exercises ape
    LEFT JOIN public.exercises e ON e.id = ape.exercise_id
    WHERE ape.deleted_at IS NULL
      AND (CASE WHEN EXISTS (SELECT 1 FROM public.assigned_program_exercises z
                              WHERE z.session_log_id = p_session_id)
                 THEN ape.session_log_id = p_session_id
                 ELSE ape.day_id = v_day_id END)
  ) sub;

  SELECT jsonb_build_object(
    'success', true,
    'id', s.id,
    'day_number', s.day_number,
    'started_at', s.started_at,
    'completed_at', s.completed_at,
    'duration_seconds', s.duration_seconds,
    'total_volume_kg', s.total_volume_kg,
    'active_calories', s.active_calories,
    'hr_avg', s.live_hr_avg,
    'hr_max', s.live_hr_max,
    -- Uvek [[sekunde, bpm], ...], bez obzira kojim oblikom je puls upisan.
    'hr_series', hr.ser,
    'max_hr', v_max_hr,
    'zones', public._compute_hr_zones(hr.ser, v_max_hr),
    'notes', s.notes,
    'program_name', ap.name,
    'day_name', ad.name,
    'entry_title', s.entry_title,
    'entered_by_trainer', s.entered_by_trainer,
    'birth_year', ath.birth_year,
    'sets_done', (SELECT count(*) FROM public.set_logs sl WHERE sl.session_log_id = s.id AND sl.done = true),
    'exercises', COALESCE(v_exercises, '[]'::jsonb)
  ) INTO v_result
  FROM public.workout_session_logs s
  CROSS JOIN LATERAL (SELECT public._normalize_hr_series(s.hr_series, s.started_at) AS ser) hr
  LEFT JOIN public.assigned_programs ap ON ap.id = s.assigned_program_id
  LEFT JOIN public.assigned_program_days ad ON ad.id = s.day_id
  LEFT JOIN public.athletes ath ON ath.id = s.athlete_id
  WHERE s.id = p_session_id;

  RETURN v_result;
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
    -- {ts, bpm} kao telefon i sat: mini grafikon kod trenera uzivo cita taj oblik.
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
