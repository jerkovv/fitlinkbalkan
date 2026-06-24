CREATE OR REPLACE FUNCTION public.athlete_poll_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid := auth.uid(); v_state jsonb;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;

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
      'watch_last_hr_at', wls.watch_last_hr_at,
      'last_heartbeat', wls.last_heartbeat,
      'started_at_ms', (extract(epoch FROM s.started_at)*1000)::bigint,
      'rest_ends_at_ms', (extract(epoch FROM wls.rest_ends_at)*1000)::bigint,
      'thumbnail_url', (SELECT e.thumbnail_url FROM public.exercises e WHERE e.name = wls.current_exercise_name LIMIT 1)
    )
  ) INTO v_state
  FROM public.workout_live_state wls
  JOIN public.workout_session_logs s ON s.id = wls.session_log_id
  WHERE wls.athlete_id = v_user_id
    AND wls.current_state IN ('active','rest')
    AND wls.last_heartbeat > now() - interval '5 minutes'
  ORDER BY wls.last_heartbeat DESC
  LIMIT 1;

  IF v_state IS NULL THEN
    v_state := jsonb_build_object('success', true, 'user_id', v_user_id,
      'server_now_ms', (extract(epoch FROM now())*1000)::bigint, 'workout', NULL);
  END IF;
  RETURN v_state;
END $function$;
