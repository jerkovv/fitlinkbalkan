-- Sat nije znao da je trener izmenio plan uzivo: stanje koje cita nije nosilo verziju plana,
-- pa su serije posle izmene tiho odbacivane ili upisivane pod drugu vezbu.
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

  UPDATE public.watch_pairing_tokens
  SET last_used_at = now()
  WHERE token = p_token;

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
      -- Raste kad trener izmeni vezbe ili serije usred treninga; sat tada ucitava plan ponovo.
      'plan_version', wls.plan_version,
      -- Brojke koje je vezbac ukucao za tekucu seriju na satu ili telefonu, pre zavrsetka.
      'draft', public._set_draft_json(wls.session_log_id),
      'hr_source', wls.hr_source,
      'sensor_live', COALESCE(wls.hr_source = 'sensor'
                              AND wls.hr_last_at > now() - interval '20 seconds', false),
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
