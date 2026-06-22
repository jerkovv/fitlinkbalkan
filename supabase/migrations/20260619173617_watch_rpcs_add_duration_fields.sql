-- 1. watch_compute_position: + is_duration_based, planned_duration_minutes
CREATE OR REPLACE FUNCTION public.watch_compute_position(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_day_id uuid;
  v_row record;
BEGIN
  SELECT day_id INTO v_day_id FROM public.workout_session_logs WHERE id = p_session_id;
  IF v_day_id IS NULL THEN
    RETURN jsonb_build_object('complete', true, 'error', 'no_session');
  END IF;

  WITH plan AS (
    SELECT ape.id AS ape_id,
           ape.position,
           (row_number() OVER (ORDER BY ape.position) - 1)::int AS exercise_idx,
           ape.sets,
           COALESCE(ape.rest_seconds, 60) AS rest_seconds,
           CASE WHEN ape.reps ~ '^[0-9]+$' THEN ape.reps::int ELSE NULL END AS planned_reps,
           ape.weight_kg AS planned_weight,
           ape.duration_minutes AS planned_duration_minutes,
           COALESCE(e.is_duration_based, false) AS is_duration_based,
           COALESCE(e.name_en, e.name) AS exercise_name
    FROM public.assigned_program_exercises ape
    JOIN public.exercises e ON e.id = ape.exercise_id
    WHERE ape.day_id = v_day_id
      AND ape.deleted_at IS NULL
  ),
  done AS (
    SELECT exercise_id AS ape_id, count(*) AS done_count
    FROM public.set_logs
    WHERE session_log_id = p_session_id AND done = true
    GROUP BY exercise_id
  ),
  merged AS (
    SELECT p.*, COALESCE(d.done_count, 0) AS done_count
    FROM plan p LEFT JOIN done d ON d.ape_id = p.ape_id
  )
  SELECT * INTO v_row
  FROM merged
  WHERE done_count < sets
  ORDER BY position
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('complete', true);
  END IF;

  RETURN jsonb_build_object(
    'complete', false,
    'ape_id', v_row.ape_id,
    'exercise_idx', v_row.exercise_idx,
    'set_number', (v_row.done_count + 1)::int,
    'total_sets', v_row.sets,
    'rest_seconds', v_row.rest_seconds,
    'exercise_name', v_row.exercise_name,
    'planned_reps', v_row.planned_reps,
    'planned_weight', v_row.planned_weight,
    'planned_duration_minutes', v_row.planned_duration_minutes,
    'is_duration_based', v_row.is_duration_based
  );
END $function$;

-- 2. watch_get_workout_plan: + is_duration_based, duration_minutes po vezbi
CREATE OR REPLACE FUNCTION public.watch_get_workout_plan(p_token text, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_day_id uuid;
  v_exercises jsonb;
  v_all_done boolean;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.watch_pairing_tokens
  WHERE token = p_token
    AND revoked_at IS NULL
    AND expires_at > now();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  SELECT day_id INTO v_day_id
  FROM public.workout_session_logs
  WHERE id = p_session_id
    AND athlete_id = v_user_id;

  IF v_day_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  WITH plan AS (
    SELECT ape.id AS ape_id,
           ape.position,
           (row_number() OVER (ORDER BY ape.position) - 1)::int AS exercise_idx,
           ape.sets,
           COALESCE(ape.rest_seconds, 60) AS rest_seconds,
           ape.reps AS reps_text,
           CASE WHEN ape.reps ~ '^[0-9]+$' THEN ape.reps::int ELSE NULL END AS planned_reps,
           ape.weight_kg AS planned_weight,
           ape.duration_minutes AS duration_minutes,
           COALESCE(e.is_duration_based, false) AS is_duration_based,
           COALESCE(e.name_en, e.name) AS exercise_name
    FROM public.assigned_program_exercises ape
    JOIN public.exercises e ON e.id = ape.exercise_id
    WHERE ape.day_id = v_day_id
      AND ape.deleted_at IS NULL
  ),
  done AS (
    SELECT exercise_id AS ape_id, count(*) AS done_count
    FROM public.set_logs
    WHERE session_log_id = p_session_id AND done = true
    GROUP BY exercise_id
  ),
  merged AS (
    SELECT p.*, COALESCE(d.done_count, 0)::int AS done_count
    FROM plan p
    LEFT JOIN done d ON d.ape_id = p.ape_id
  )
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'ape_id', m.ape_id,
        'exercise_idx', m.exercise_idx,
        'position', m.position,
        'sets', m.sets,
        'rest_seconds', m.rest_seconds,
        'reps_text', m.reps_text,
        'planned_reps', m.planned_reps,
        'planned_weight', m.planned_weight,
        'duration_minutes', m.duration_minutes,
        'is_duration_based', m.is_duration_based,
        'exercise_name', m.exercise_name,
        'done_count', m.done_count
      ) ORDER BY m.position
    ),
    bool_and(m.done_count >= m.sets)
  INTO v_exercises, v_all_done
  FROM merged m;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'day_id', v_day_id,
    'server_now_ms', (extract(epoch FROM now()) * 1000)::bigint,
    'complete', COALESCE(v_all_done, true),
    'exercises', COALESCE(v_exercises, '[]'::jsonb)
  );
END $function$;

-- 3. watch_poll_state: + current_exercise_idx, is_duration_based, current_duration_minutes
CREATE OR REPLACE FUNCTION public.watch_poll_state(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid; v_state jsonb; v_max_hr integer;
BEGIN
  SELECT user_id INTO v_user_id FROM public.watch_pairing_tokens
   WHERE token = p_token AND revoked_at IS NULL AND expires_at > now();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'invalid_token'); END IF;

  v_max_hr := public.athlete_effective_max_hr(v_user_id);

  SELECT jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'server_now_ms', (extract(epoch FROM now())*1000)::bigint,
    'workout', jsonb_build_object(
      'session_id', wls.session_log_id,
      'current_exercise_name', wls.current_exercise_name,
      'current_exercise_idx', wls.current_exercise_idx,
      'current_set_number', wls.current_set_number,
      'total_sets', wls.total_sets,
      'current_state', wls.current_state,
      'current_hr', wls.current_hr,
      'is_duration_based', (
        SELECT COALESCE(e2.is_duration_based, false)
        FROM public.assigned_program_exercises ape2
        JOIN public.exercises e2 ON e2.id = ape2.exercise_id
        WHERE ape2.day_id = s.day_id AND ape2.deleted_at IS NULL
        ORDER BY ape2.position OFFSET COALESCE(wls.current_exercise_idx, 0) LIMIT 1
      ),
      'current_duration_minutes', (
        SELECT ape2.duration_minutes
        FROM public.assigned_program_exercises ape2
        WHERE ape2.day_id = s.day_id AND ape2.deleted_at IS NULL
        ORDER BY ape2.position OFFSET COALESCE(wls.current_exercise_idx, 0) LIMIT 1
      ),
      'last_heartbeat', wls.last_heartbeat,
      'started_at_ms', (extract(epoch FROM s.started_at)*1000)::bigint,
      'rest_ends_at_ms', (extract(epoch FROM wls.rest_ends_at)*1000)::bigint,
      'hr_max', v_max_hr,
      'hr_zone', public.hr_zone(wls.current_hr, v_max_hr),
      'hr_zone_name', public.hr_zone_name(public.hr_zone(wls.current_hr, v_max_hr)),
      'trainer_message', (
        SELECT jsonb_build_object(
          'id', m.id, 'message', m.message, 'message_type', m.message_type,
          'created_at_ms', (extract(epoch FROM m.created_at)*1000)::bigint
        )
        FROM public.workout_live_messages m
        WHERE m.session_log_id = wls.session_log_id
          AND m.created_at > now() - interval '2 minutes'
        ORDER BY m.created_at DESC LIMIT 1
      )
    )
  ) INTO v_state
  FROM public.workout_live_state wls
  JOIN public.workout_session_logs s ON s.id = wls.session_log_id
  WHERE wls.athlete_id = v_user_id
    AND wls.current_state IN ('active','rest')
    AND wls.last_heartbeat > now() - interval '5 minutes'
  ORDER BY wls.last_heartbeat DESC LIMIT 1;

  IF v_state IS NULL THEN
    v_state := jsonb_build_object('success', true, 'user_id', v_user_id,
      'server_now_ms', (extract(epoch FROM now())*1000)::bigint, 'workout', NULL);
  END IF;
  RETURN v_state;
END $function$;
