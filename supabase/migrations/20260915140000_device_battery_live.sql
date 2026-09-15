-- Baterija trake i sata tokom treninga. Traka je povezana sa telefonom samo dok
-- traje trening, pa telefon procenat salje serveru (athlete_report_sensor_battery),
-- a sat svoj (watch_report_battery). Oba idu u zivo stanje: trener ih vidi u kartici
-- Puls i kao ikonicu u spisku aktivnih, a vezbac bateriju sata kad je niska.
-- Posebne funkcije umesto novog parametra u heartbeat-u: dodat parametar bi napravio
-- drugu verziju iste funkcije i poziv postojece aplikacije bi postao dvosmislen.

ALTER TABLE public.workout_live_state
  ADD COLUMN IF NOT EXISTS sensor_battery smallint,
  ADD COLUMN IF NOT EXISTS sensor_battery_at timestamptz,
  ADD COLUMN IF NOT EXISTS watch_battery smallint,
  ADD COLUMN IF NOT EXISTS watch_battery_at timestamptz;

CREATE OR REPLACE FUNCTION public.athlete_report_sensor_battery(p_session_id uuid, p_battery integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_rows int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  IF p_battery IS NULL OR p_battery < 0 OR p_battery > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_battery');
  END IF;

  UPDATE public.workout_live_state
  SET sensor_battery = p_battery,
      sensor_battery_at = now()
  WHERE session_log_id = p_session_id
    AND athlete_id = v_user_id
    AND current_state IN ('active','rest');
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object('success', v_rows > 0);
END $function$;

REVOKE EXECUTE ON FUNCTION public.athlete_report_sensor_battery(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.athlete_report_sensor_battery(uuid, integer) TO authenticated, service_role;

-- Sat se prijavljuje tokenom (kao watch_update_workout_hr), ne sesijom korisnika.
CREATE OR REPLACE FUNCTION public.watch_report_battery(p_token text, p_session_id uuid, p_battery integer)
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
  IF p_battery IS NULL OR p_battery < 0 OR p_battery > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_battery');
  END IF;

  UPDATE public.workout_live_state
  SET watch_battery = p_battery,
      watch_battery_at = now()
  WHERE session_log_id = p_session_id
    AND athlete_id = v_user_id
    AND current_state IN ('active','rest');
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object('success', v_rows > 0);
END $function$;

GRANT EXECUTE ON FUNCTION public.watch_report_battery(text, uuid, integer) TO anon, authenticated, service_role;

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

-- Novi izlazni stubovi menjaju tip rezultata, pa CREATE OR REPLACE ne prolazi.
DROP FUNCTION IF EXISTS public.get_active_athletes_for_trainer();

CREATE FUNCTION public.get_active_athletes_for_trainer()
 RETURNS TABLE(athlete_id uuid, athlete_name text, session_id uuid, started_at timestamp with time zone, duration_seconds integer, current_exercise_name text, current_set_number integer, current_hr integer, current_active_calories numeric, watch_last_hr_at timestamp with time zone, hr_last_at timestamp with time zone, hr_source text, hr_zone integer, hr_zone_name text, current_state text, rest_ends_at timestamp with time zone, total_completed_sets integer, last_heartbeat timestamp with time zone, sensor_battery integer, sensor_battery_at timestamp with time zone, watch_battery integer, watch_battery_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    a.id as athlete_id,
    p.full_name as athlete_name,
    wsl.id as session_id,
    wsl.started_at,
    extract(epoch from (now() - wsl.started_at))::integer as duration_seconds,
    wls.current_exercise_name,
    wls.current_set_number,
    wls.current_hr,
    coalesce(wls.current_active_calories, 0) as current_active_calories,
    wls.watch_last_hr_at,
    wls.hr_last_at,
    wls.hr_source,
    public.hr_zone(wls.current_hr, public.athlete_effective_max_hr(a.id)) as hr_zone,
    public.hr_zone_name(public.hr_zone(wls.current_hr, public.athlete_effective_max_hr(a.id))) as hr_zone_name,
    wls.current_state,
    wls.rest_ends_at,
    coalesce(wls.total_completed_sets, 0) as total_completed_sets,
    coalesce(wls.last_heartbeat, wsl.started_at) as last_heartbeat,
    wls.sensor_battery::int as sensor_battery,
    wls.sensor_battery_at,
    wls.watch_battery::int as watch_battery,
    wls.watch_battery_at
  from public.athletes a
  join public.profiles p on p.id = a.id
  join public.workout_session_logs wsl on wsl.athlete_id = a.id and wsl.is_active = true
  left join public.workout_live_state wls on wls.session_log_id = wsl.id
  where a.trainer_id = auth.uid()
  order by wsl.started_at desc;
$function$;

GRANT EXECUTE ON FUNCTION public.get_active_athletes_for_trainer() TO anon, authenticated, service_role;
