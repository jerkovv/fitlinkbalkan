-- =====================================================================
-- BACKFILL / DRIFT-CAPTURE MIGRATION  (version control only — NE DEPLOYUJE SE)
-- Apple Watch live-state RPC povrsina (token-based).
--
-- Iste price kao 20260705120000_backfill_inapp_workout_engine_rpcs.sql:
-- funkcije postoje u prod-u (primenjene preko MCP-a), bez migracionog fajla.
-- Hvatamo ih VERBATIM. Ponasanje se NE menja.
--
-- Sadrzi i okidac trg_process_watch_button_event nad public.watch_button_events
-- (watch_press_* funkcije INSERT-uju event, okidac ga procesira u live-state).
-- =====================================================================

-- 1) Watch action RPC-jevi (oba overload-a gde postoje) -------------

CREATE OR REPLACE FUNCTION public.watch_complete_set(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_current_set integer;
  v_total_sets integer;
  v_session_id uuid;
  v_exercise_name text;
BEGIN
  -- Validacija token-a
  SELECT user_id INTO v_user_id
  FROM public.watch_pairing_tokens
  WHERE token = p_token AND revoked_at IS NULL AND expires_at > now();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  
  -- Uzmi trenutno stanje
  SELECT session_log_id, current_set_number, total_sets, current_exercise_name
  INTO v_session_id, v_current_set, v_total_sets, v_exercise_name
  FROM public.workout_live_state
  WHERE athlete_id = v_user_id
    AND current_state IN ('active', 'rest')
    AND last_heartbeat > now() - interval '5 minutes'
  ORDER BY last_heartbeat DESC
  LIMIT 1;
  
  IF v_session_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_active_session');
  END IF;
  
  -- Inkrementuj set i prebaci na rest
  -- Ako je total_sets pogresno (= 1) ili nedefinisano, samo inkrementuj i postavi rest
  -- Ne postavljaj 'completed' osim ako se zaista desilo
  UPDATE public.workout_live_state
  SET 
    current_set_number = current_set_number + 1,
    current_state = 'rest',
    total_completed_sets = total_completed_sets + 1,
    last_heartbeat = now()
  WHERE session_log_id = v_session_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'new_state', 'rest',
    'new_set_number', v_current_set + 1,
    'exercise', v_exercise_name
  );
END $function$;
GRANT EXECUTE ON FUNCTION public.watch_complete_set(p_token text) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.watch_complete_set(p_token text, p_session_id uuid, p_reps integer DEFAULT NULL::integer, p_weight numeric DEFAULT NULL::numeric, p_rpe numeric DEFAULT NULL::numeric, p_duration_minutes integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM public.watch_pairing_tokens
   WHERE token=p_token AND revoked_at IS NULL AND expires_at>now();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'invalid_token'); END IF;
  RETURN public._engine_complete_set(v_user_id, p_session_id, p_reps, p_weight, p_rpe, p_duration_minutes);
END $function$;
GRANT EXECUTE ON FUNCTION public.watch_complete_set(p_token text, p_session_id uuid, p_reps integer, p_weight numeric, p_rpe numeric, p_duration_minutes integer) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.watch_skip_rest(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_session_id uuid;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.watch_pairing_tokens
  WHERE token = p_token AND revoked_at IS NULL AND expires_at > now();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  
  SELECT session_log_id INTO v_session_id
  FROM public.workout_live_state
  WHERE athlete_id = v_user_id
    AND current_state = 'rest'
    AND last_heartbeat > now() - interval '10 minutes'
  ORDER BY last_heartbeat DESC
  LIMIT 1;
  
  IF v_session_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_active_rest');
  END IF;
  
  UPDATE public.workout_live_state
  SET 
    current_state = 'active',
    last_heartbeat = now()
  WHERE session_log_id = v_session_id;
  
  RETURN jsonb_build_object('success', true, 'new_state', 'active');
END $function$;
GRANT EXECUTE ON FUNCTION public.watch_skip_rest(p_token text) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.watch_skip_rest(p_token text, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM public.watch_pairing_tokens
   WHERE token=p_token AND revoked_at IS NULL AND expires_at>now();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'invalid_token'); END IF;
  RETURN public._engine_skip_rest(v_user_id, p_session_id);
END $function$;
GRANT EXECUTE ON FUNCTION public.watch_skip_rest(p_token text, p_session_id uuid) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.watch_extend_rest(p_token text, p_extra_seconds integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.watch_pairing_tokens
  WHERE token = p_token AND revoked_at IS NULL AND expires_at > now();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  
  IF p_extra_seconds < 1 OR p_extra_seconds > 600 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_seconds');
  END IF;
  
  -- Samo refresh-uj heartbeat da iPhone vidi da je Watch jos aktivan
  UPDATE public.workout_live_state
  SET last_heartbeat = now()
  WHERE athlete_id = v_user_id
    AND current_state = 'rest';
  
  RETURN jsonb_build_object('success', true, 'extra_seconds', p_extra_seconds);
END $function$;
GRANT EXECUTE ON FUNCTION public.watch_extend_rest(p_token text, p_extra_seconds integer) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.watch_extend_rest(p_token text, p_session_id uuid, p_seconds integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM public.watch_pairing_tokens
   WHERE token=p_token AND revoked_at IS NULL AND expires_at>now();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'invalid_token'); END IF;
  RETURN public._engine_extend_rest(v_user_id, p_session_id, p_seconds);
END $function$;
GRANT EXECUTE ON FUNCTION public.watch_extend_rest(p_token text, p_session_id uuid, p_seconds integer) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.watch_set_rest_ends_at(p_token text, p_rest_ends_at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_rows int;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.watch_pairing_tokens
  WHERE token = p_token
    AND revoked_at IS NULL
    AND expires_at > now();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  UPDATE public.workout_live_state
  SET rest_ends_at = to_timestamp(p_rest_ends_at_ms / 1000.0),
      last_heartbeat = now()
  WHERE athlete_id = v_user_id
    AND current_state = 'rest'
    AND last_heartbeat > now() - interval '5 minutes';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'updated', v_rows, 'rest_ends_at_ms', p_rest_ends_at_ms);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.watch_set_rest_ends_at(p_token text, p_rest_ends_at_ms bigint) TO public, anon, authenticated, service_role;

-- 2) Watch 'press button' RPC-jevi (upisuju u watch_button_events) --

CREATE OR REPLACE FUNCTION public.watch_press_complete_button(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.watch_pairing_tokens
  WHERE token = p_token AND revoked_at IS NULL AND expires_at > now();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  
  -- Cleanup starih eventova za ovog korisnika (preko 1 min stari)
  DELETE FROM public.watch_button_events 
  WHERE athlete_id = v_user_id 
    AND created_at < now() - interval '1 minute';
  
  -- Ubaci event
  INSERT INTO public.watch_button_events (athlete_id, event_type)
  VALUES (v_user_id, 'complete_set');
  
  RETURN jsonb_build_object('success', true);
END $function$;
GRANT EXECUTE ON FUNCTION public.watch_press_complete_button(p_token text) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.watch_press_skip_button(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.watch_pairing_tokens
  WHERE token = p_token AND revoked_at IS NULL AND expires_at > now();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  
  DELETE FROM public.watch_button_events 
  WHERE athlete_id = v_user_id 
    AND created_at < now() - interval '1 minute';
  
  INSERT INTO public.watch_button_events (athlete_id, event_type)
  VALUES (v_user_id, 'skip_rest');
  
  RETURN jsonb_build_object('success', true);
END $function$;
GRANT EXECUTE ON FUNCTION public.watch_press_skip_button(p_token text) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.watch_press_extend_button(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.watch_pairing_tokens
  WHERE token = p_token AND revoked_at IS NULL AND expires_at > now();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  
  DELETE FROM public.watch_button_events 
  WHERE athlete_id = v_user_id 
    AND created_at < now() - interval '1 minute';
  
  INSERT INTO public.watch_button_events (athlete_id, event_type)
  VALUES (v_user_id, 'extend_rest_30s');
  
  RETURN jsonb_build_object('success', true);
END $function$;
GRANT EXECUTE ON FUNCTION public.watch_press_extend_button(p_token text) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.watch_press_finish_button(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id
  FROM watch_pairing_tokens
  WHERE token = p_token
    AND (expires_at IS NULL OR expires_at > now());
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  
  -- Insertuj event
  INSERT INTO public.watch_button_events (athlete_id, event_type)
  VALUES (v_user_id, 'finish_workout');
  
  RETURN jsonb_build_object('success', true);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.watch_press_finish_button(p_token text) TO public, anon, authenticated, service_role;

-- 3) Watch token provisioning -------------------------------------

CREATE OR REPLACE FUNCTION public.get_or_create_watch_token()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_token text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT token INTO v_token
  FROM watch_pairing_tokens
  WHERE user_id = v_user_id
    AND revoked_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token IS NULL THEN
    v_token := encode(extensions.gen_random_bytes(24), 'hex');

    INSERT INTO watch_pairing_tokens (user_id, token, created_at)
    VALUES (v_user_id, v_token, now());
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'token', v_token,
    'user_id', v_user_id
  );
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_or_create_watch_token() TO public, anon, authenticated, service_role;

-- 4) Watch button-event procesor + okidac -------------------------

CREATE OR REPLACE FUNCTION public.process_watch_button_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_state text;
  v_current_set_number int;
  v_total_sets int;
BEGIN
  SELECT current_state, current_set_number, total_sets
  INTO v_current_state, v_current_set_number, v_total_sets
  FROM workout_live_state
  WHERE athlete_id = NEW.athlete_id
    AND last_heartbeat > now() - interval '5 minutes'
  ORDER BY last_heartbeat DESC
  LIMIT 1;
  
  IF v_current_state IS NULL THEN
    RAISE NOTICE 'Watch event for % but no active workout', NEW.athlete_id;
    RETURN NEW;
  END IF;
  
  IF NEW.event_type = 'complete_set' THEN
    IF v_current_state = 'active' THEN
      UPDATE workout_live_state
      SET 
        current_state = 'rest',
        last_heartbeat = now()
      WHERE athlete_id = NEW.athlete_id
        AND last_heartbeat > now() - interval '5 minutes';
    END IF;
    
  ELSIF NEW.event_type = 'skip_rest' THEN
    IF v_current_state = 'rest' THEN
      UPDATE workout_live_state
      SET 
        current_state = 'active',
        current_set_number = LEAST(v_current_set_number + 1, COALESCE(v_total_sets, v_current_set_number + 1)),
        last_heartbeat = now()
      WHERE athlete_id = NEW.athlete_id
        AND last_heartbeat > now() - interval '5 minutes';
    END IF;
    
  ELSIF NEW.event_type = 'extend_rest_30s' THEN
    UPDATE workout_live_state
    SET last_heartbeat = now()
    WHERE athlete_id = NEW.athlete_id;
    
  ELSIF NEW.event_type = 'finish_workout' THEN
    -- Postavi current_state na 'completed'
    -- Lovable web ce dalje uraditi cleanup (DELETE row) i navigation
    UPDATE workout_live_state
    SET 
      current_state = 'completed',
      last_heartbeat = now()
    WHERE athlete_id = NEW.athlete_id
      AND last_heartbeat > now() - interval '5 minutes';
    RAISE NOTICE 'Watch finish_workout: switched to completed';
  END IF;
  
  RETURN NEW;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.process_watch_button_event() TO public, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_process_watch_button_event ON public.watch_button_events;
CREATE TRIGGER trg_process_watch_button_event AFTER INSERT ON public.watch_button_events FOR EACH ROW EXECUTE FUNCTION process_watch_button_event();

-- 5) Maintenance (trenutno NIJE zakazan preko pg_cron-a) ----------

CREATE OR REPLACE FUNCTION public.cleanup_old_watch_events()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.watch_button_events
  WHERE created_at < now() - interval '30 seconds';
END;
$function$;
GRANT EXECUTE ON FUNCTION public.cleanup_old_watch_events() TO public, anon, authenticated, service_role;
