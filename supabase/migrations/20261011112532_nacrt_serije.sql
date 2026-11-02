-- Nacrt tekuce serije. Brojke koje vezbac ukuca na satu ili telefonu vide se na drugom
-- uredjaju odmah, i pre nego sto serija bude zavrsena. Zaseban sto, a ne kolona u
-- workout_live_state: svaka izmena tog reda pali tg_live_state_push i realtime.
CREATE TABLE IF NOT EXISTS public.workout_set_drafts (
  session_log_id uuid PRIMARY KEY REFERENCES public.workout_session_logs(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL,
  exercise_idx integer NOT NULL,
  set_number integer NOT NULL,
  reps integer,
  weight numeric,
  minutes integer,
  source text,
  rev bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Bez politika: sto se cita i pise samo kroz funkcije ispod.
ALTER TABLE public.workout_set_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workout_set_drafts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._set_draft_json(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'exercise_idx', d.exercise_idx, 'set_number', d.set_number,
    'reps', d.reps, 'weight', d.weight, 'minutes', d.minutes,
    'rev', d.rev, 'source', d.source)
  FROM public.workout_set_drafts d
  WHERE d.session_log_id = p_session_id;
$function$;

REVOKE EXECUTE ON FUNCTION public._set_draft_json(uuid) FROM PUBLIC, anon, authenticated;

-- rev raste sa svakim upisom: uredjaj primenjuje tudji nacrt samo ako je noviji od
-- poslednjeg koji je sam upisao ili vec primenio.
CREATE OR REPLACE FUNCTION public._engine_set_draft(p_user_id uuid, p_session_id uuid, p_exercise_idx integer, p_set_number integer, p_reps integer, p_weight numeric, p_minutes integer, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rev bigint;
BEGIN
  IF p_session_id IS NULL OR p_exercise_idx IS NULL OR p_set_number IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_position');
  END IF;
  IF (p_reps IS NOT NULL AND (p_reps < 0 OR p_reps > 999))
     OR (p_weight IS NOT NULL AND (p_weight < 0 OR p_weight > 1000))
     OR (p_minutes IS NOT NULL AND (p_minutes < 1 OR p_minutes > 240)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workout_session_logs
                  WHERE id = p_session_id AND athlete_id = p_user_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_active_session');
  END IF;

  INSERT INTO public.workout_set_drafts AS d
         (session_log_id, athlete_id, exercise_idx, set_number, reps, weight, minutes, source)
  VALUES (p_session_id, p_user_id, p_exercise_idx, p_set_number, p_reps, p_weight, p_minutes, p_source)
  ON CONFLICT (session_log_id) DO UPDATE
     SET exercise_idx = EXCLUDED.exercise_idx, set_number = EXCLUDED.set_number,
         reps = EXCLUDED.reps, weight = EXCLUDED.weight, minutes = EXCLUDED.minutes,
         source = EXCLUDED.source, rev = d.rev + 1, updated_at = now()
  RETURNING d.rev INTO v_rev;

  RETURN jsonb_build_object('success', true, 'rev', v_rev);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._engine_set_draft(uuid, uuid, integer, integer, integer, numeric, integer, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.athlete_set_draft(p_session_id uuid, p_exercise_idx integer, p_set_number integer, p_reps integer DEFAULT NULL::integer, p_weight numeric DEFAULT NULL::numeric, p_minutes integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  RETURN public._engine_set_draft(v_user_id, p_session_id, p_exercise_idx, p_set_number,
                                  p_reps, p_weight, p_minutes, 'phone');
END;
$function$;

CREATE OR REPLACE FUNCTION public.watch_set_draft(p_token text, p_session_id uuid, p_exercise_idx integer, p_set_number integer, p_reps integer DEFAULT NULL::integer, p_weight numeric DEFAULT NULL::numeric, p_minutes integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM public.watch_pairing_tokens
   WHERE token = p_token AND revoked_at IS NULL AND expires_at > now();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'invalid_token'); END IF;
  RETURN public._engine_set_draft(v_user_id, p_session_id, p_exercise_idx, p_set_number,
                                  p_reps, p_weight, p_minutes, 'watch');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.athlete_set_draft(uuid, integer, integer, integer, numeric, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.watch_set_draft(text, uuid, integer, integer, integer, numeric, integer) TO anon, authenticated, service_role;

-- Oba citanja stanja nose nacrt; ostatak tela je nepromenjen.
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
      'plan_version', wls.plan_version,
      -- Brojke koje je vezbac ukucao za tekucu seriju na satu ili telefonu, pre zavrsetka.
      'draft', public._set_draft_json(wls.session_log_id),
      'started_at_ms', (extract(epoch FROM s.started_at)*1000)::bigint,
      'rest_ends_at_ms', (extract(epoch FROM wls.rest_ends_at)*1000)::bigint,
      'thumbnail_url', (SELECT e.thumbnail_url FROM public.exercises e WHERE e.name = wls.current_exercise_name LIMIT 1),
      -- Baterija sata, samo ako je izmerena u ovom treningu.
      'watch_battery', CASE WHEN wls.watch_battery_at >= s.started_at THEN wls.watch_battery END
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
