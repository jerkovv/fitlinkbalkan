-- watch_get_user_context: dodat current_exercise_idx u active_workout payload (sat odmah zna
-- indeks vezbe za lokalni model). Version-control only: vec primenjeno u bazi preko MCP-a.
CREATE OR REPLACE FUNCTION public.watch_get_user_context(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_active_workout jsonb;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.watch_pairing_tokens
  WHERE token = p_token
    AND revoked_at IS NULL
    AND expires_at > now();

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.watch_pairing_tokens
  SET last_used_at = now()
  WHERE token = p_token;

  SELECT jsonb_build_object(
    'user_id', v_user_id,
    'server_now_ms', (extract(epoch FROM now()) * 1000)::bigint,
    'active_workout', (
      SELECT row_to_json(s) FROM (
        SELECT
          wls.session_log_id AS session_id,
          wls.current_exercise_idx,
          wls.current_exercise_name,
          wls.current_set_number,
          wls.total_sets,
          wls.current_state,
          wls.current_hr,
          (extract(epoch FROM wls.rest_ends_at) * 1000)::bigint AS rest_ends_at_ms
        FROM public.workout_live_state wls
        WHERE wls.athlete_id = v_user_id
          AND wls.current_state IN ('active', 'rest')
          AND wls.last_heartbeat > now() - interval '5 minutes'
        ORDER BY wls.last_heartbeat DESC
        LIMIT 1
      ) s
    )
  ) INTO v_active_workout;

  RETURN v_active_workout;
END;
$function$;
