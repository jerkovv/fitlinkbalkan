-- Workout COALESCE finalizacija (telefon/sat se ne gaze) + in-app detalj RPC.
-- Vec primenjeno u bazi (kreirano preko MCP); ova migracija unosi definicije
-- u version-control radi reproducibilnog setup-a. Bezbedno re-runnable
-- (CREATE OR REPLACE).

-- COALESCE u complete_workout_session: telefon ne gazi satove kalorije/puls sa NULL
CREATE OR REPLACE FUNCTION public.complete_workout_session(p_session_id uuid, p_hr_avg integer DEFAULT NULL::integer, p_hr_max integer DEFAULT NULL::integer, p_hr_min integer DEFAULT NULL::integer, p_active_calories numeric DEFAULT NULL::numeric, p_hr_series jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_session public.workout_session_logs;
  v_total_volume numeric;
  v_set_count integer;
  v_duration integer;
begin
  select * into v_session from public.workout_session_logs
  where id = p_session_id and athlete_id = auth.uid();
  if v_session.id is null then
    raise exception 'Session not found or not yours';
  end if;
  select coalesce(sum(reps * weight_kg), 0), count(*)
  into v_total_volume, v_set_count
  from public.set_logs where session_log_id = p_session_id and done = true;
  v_duration := extract(epoch from (now() - v_session.started_at))::integer;
  update public.workout_session_logs set
    completed_at = now(), duration_seconds = v_duration, is_active = false,
    live_hr_avg = COALESCE(p_hr_avg, live_hr_avg),
    live_hr_max = COALESCE(p_hr_max, live_hr_max),
    live_hr_min = COALESCE(p_hr_min, live_hr_min),
    active_calories = COALESCE(p_active_calories, active_calories),
    hr_series = COALESCE(p_hr_series, hr_series),
    total_volume_kg = v_total_volume
  where id = p_session_id;
  update public.workout_live_state set current_state = 'completed'
  where session_log_id = p_session_id;
  return jsonb_build_object('session_id', p_session_id, 'duration_seconds', v_duration, 'total_volume_kg', v_total_volume, 'sets_completed', v_set_count);
end $function$;

-- watch finish + engine: prima kalorije/puls/hr_series (6 param), COALESCE upis
CREATE OR REPLACE FUNCTION public._engine_finish_workout(p_user_id uuid, p_session_id uuid, p_active_calories integer DEFAULT NULL::integer, p_hr_avg integer DEFAULT NULL::integer, p_hr_max integer DEFAULT NULL::integer, p_hr_series jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM 1 FROM public.workout_session_logs
   WHERE id = p_session_id AND athlete_id = p_user_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_ended');
  END IF;
  PERFORM public._finalize_workout_session(p_session_id);
  IF p_active_calories IS NOT NULL OR p_hr_avg IS NOT NULL OR p_hr_max IS NOT NULL OR p_hr_series IS NOT NULL THEN
    UPDATE public.workout_session_logs
    SET active_calories = COALESCE(p_active_calories, active_calories),
        live_hr_avg = COALESCE(p_hr_avg, live_hr_avg),
        live_hr_max = COALESCE(p_hr_max, live_hr_max),
        hr_series = COALESCE(p_hr_series, hr_series)
    WHERE id = p_session_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'state', 'completed');
END $function$;

CREATE OR REPLACE FUNCTION public.watch_finish_workout(p_token text, p_session_id uuid, p_active_calories integer DEFAULT NULL::integer, p_hr_avg integer DEFAULT NULL::integer, p_hr_max integer DEFAULT NULL::integer, p_hr_series jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM public.watch_pairing_tokens
   WHERE token = p_token AND revoked_at IS NULL AND expires_at > now();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  RETURN public._engine_finish_workout(v_user_id, p_session_id, p_active_calories, p_hr_avg, p_hr_max, p_hr_series);
END $function$;

-- Detalj in-app treninga za buduci ekran (kalorije/puls/hr_series/zone)
CREATE OR REPLACE FUNCTION public.get_inapp_workout_detail(p_session_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_athlete uuid;
  v_result jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  SELECT athlete_id INTO v_athlete FROM public.workout_session_logs WHERE id = p_session_id;
  IF v_athlete IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF v_caller <> v_athlete AND NOT EXISTS (
    SELECT 1 FROM public.athletes a WHERE a.id = v_athlete AND a.trainer_id = v_caller
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;
  SELECT jsonb_build_object(
    'success', true, 'id', s.id, 'day_number', s.day_number,
    'started_at', s.started_at, 'completed_at', s.completed_at,
    'duration_seconds', s.duration_seconds, 'total_volume_kg', s.total_volume_kg,
    'active_calories', s.active_calories, 'hr_avg', s.live_hr_avg, 'hr_max', s.live_hr_max,
    'hr_series', s.hr_series, 'notes', s.notes,
    'program_name', ap.name, 'day_name', ad.name, 'birth_year', ath.birth_year,
    'sets_done', (SELECT count(*) FROM public.set_logs sl WHERE sl.session_log_id = s.id AND sl.done = true)
  ) INTO v_result
  FROM public.workout_session_logs s
  LEFT JOIN public.assigned_programs ap ON ap.id = s.assigned_program_id
  LEFT JOIN public.assigned_program_days ad ON ad.id = s.day_id
  LEFT JOIN public.athletes ath ON ath.id = s.athlete_id
  WHERE s.id = p_session_id;
  RETURN v_result;
END $function$;
