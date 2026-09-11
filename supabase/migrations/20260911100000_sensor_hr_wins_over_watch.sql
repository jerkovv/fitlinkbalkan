-- Puls: prvo senzor (traka/pojas), pa sat - svuda.
--
-- Oba izvora pisu isti current_hr: sat na ~5s (watch_update_workout_hr), telefon
-- sa trakom kroz athlete_heartbeat. Kad vezbac nosi i sat i traku, broj je
-- skakao izmedju dva uredjaja - ko je poslednji pisao, taj se video. A current_hr
-- citaju svi: trenerova lista i detalj, trenerova i vezbaceva Live Activity
-- (tg_live_state_push, trainer_live_content) i sat na zonskom ekranu.
--
-- Pravilo se zato sprovodi ovde, na jednom mestu: dok je puls sa senzora svez
-- (poslednjih 20s), sat NE gazi current_hr. Sat i dalje pise svoj otisak
-- (watch_last_hr_at - prisustvo sata i status veze), last_heartbeat i izmerene
-- kalorije, pa se nista od logike sata ne menja. Kad traka utihne, sat posle 20s
-- preuzima puls sam od sebe.
--
-- 20s je sirina: telefon salje puls sa trake na 5s, pa jedan-dva propustena
-- poziva ne prebacuju prikaz na sat i nazad.

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

  -- Desna strana SET-a vidi STARI red, pa sva tri CASE-a gledaju isto stanje
  -- senzora pre ovog upisa.
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
      current_active_calories = CASE
        WHEN p_active_calories IS NOT NULL AND p_active_calories >= 0
          THEN p_active_calories
        ELSE current_active_calories
      END,
      last_heartbeat = now(),
      watch_last_hr_at = now()   -- satov otisak ide uvek: sat JE prisutan
  WHERE session_log_id = p_session_id
    AND athlete_id = v_user_id
    AND current_state IN ('active','rest');

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_live_session');
  END IF;

  RETURN jsonb_build_object('success', true);
END $function$;

GRANT EXECUTE ON FUNCTION public.watch_update_workout_hr(text, integer, uuid, numeric) TO public, anon, authenticated, service_role;

-- Satu treba da zna ciji je current_hr: dok je senzor ziv, sat na svom ekranu
-- prikazuje taj broj umesto sopstvenog.
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
