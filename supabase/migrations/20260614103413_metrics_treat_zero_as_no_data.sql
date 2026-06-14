-- Metrike: 0 se tretira kao "nema podatka" (NULLIF / uslovni GREATEST), da kasna nula
-- (npr telefonska finalizacija bez HR/kcal) ne pregazi prave vrednosti sa sata.
-- Vec primenjeno na bazu preko MCP; ovaj fajl je samo za version control.

CREATE OR REPLACE FUNCTION public.complete_workout_session(p_session_id uuid, p_hr_avg integer DEFAULT NULL::integer, p_hr_max integer DEFAULT NULL::integer, p_hr_min integer DEFAULT NULL::integer, p_active_calories numeric DEFAULT NULL::numeric, p_hr_series jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_session public.workout_session_logs;
  v_total_volume numeric;
  v_set_count integer;
  v_duration integer;
begin
  select * into v_session
  from public.workout_session_logs
  where id = p_session_id and athlete_id = auth.uid();

  if v_session.id is null then
    raise exception 'Session not found or not yours';
  end if;

  select
    coalesce(sum(reps * weight_kg), 0),
    count(*)
  into v_total_volume, v_set_count
  from public.set_logs
  where session_log_id = p_session_id and done = true;

  v_duration := extract(epoch from (now() - v_session.started_at))::integer;

  update public.workout_session_logs
  set
    completed_at = now(),
    duration_seconds = v_duration,
    is_active = false,
    -- 0 se tretira kao "nema podatka" (NULLIF) -> ne gazi vrednost sa sata
    live_hr_avg = COALESCE(NULLIF(p_hr_avg, 0), live_hr_avg),
    live_hr_max = COALESCE(NULLIF(p_hr_max, 0), live_hr_max),
    live_hr_min = COALESCE(NULLIF(p_hr_min, 0), live_hr_min),
    active_calories = COALESCE(NULLIF(p_active_calories, 0), active_calories),
    hr_series = COALESCE(p_hr_series, hr_series),
    total_volume_kg = v_total_volume
  where id = p_session_id;

  update public.workout_live_state
  set current_state = 'completed'
  where session_log_id = p_session_id;

  return jsonb_build_object(
    'session_id', p_session_id,
    'duration_seconds', v_duration,
    'total_volume_kg', v_total_volume,
    'sets_completed', v_set_count
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.watch_report_metrics(p_token text, p_session_id uuid, p_active_calories integer DEFAULT NULL::integer, p_hr_avg integer DEFAULT NULL::integer, p_hr_max integer DEFAULT NULL::integer, p_hr_series jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_rows integer;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.watch_pairing_tokens
  WHERE token = p_token AND revoked_at IS NULL AND expires_at > now();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  -- 0 se tretira kao "nema podatka" -> nikad ne gazi pravu vrednost
  UPDATE public.workout_session_logs
  SET active_calories = CASE WHEN COALESCE(p_active_calories, 0) > 0
                             THEN GREATEST(COALESCE(active_calories, 0), p_active_calories)
                             ELSE active_calories END,
      live_hr_avg = COALESCE(NULLIF(p_hr_avg, 0), live_hr_avg),
      live_hr_max = CASE WHEN COALESCE(p_hr_max, 0) > 0
                         THEN GREATEST(COALESCE(live_hr_max, 0), p_hr_max)
                         ELSE live_hr_max END,
      hr_series = COALESCE(p_hr_series, hr_series)
  WHERE id = p_session_id AND athlete_id = v_user_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  RETURN jsonb_build_object('success', true);
END $function$
;
