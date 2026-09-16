-- Trener je za puls preko Bluetooth-a video samo "senzor", pa je sat koji emituje puls
-- (Huawei i slicni) izgledao kao pojas za grudi. Telefon sad salje i naziv uparenog
-- uredjaja, da trener vidi sta vezbac zaista nosi.
--
-- athlete_report_sensor_battery se zamenjuje sirom funkcijom (naziv + baterija). Stara
-- verzija aplikacije u prodavnici je ne poziva, pa nema sta da se pokvari.

ALTER TABLE public.workout_live_state
  ADD COLUMN IF NOT EXISTS sensor_name text;

DROP FUNCTION IF EXISTS public.athlete_report_sensor_battery(uuid, integer);

CREATE OR REPLACE FUNCTION public.athlete_report_sensor(
  p_session_id uuid,
  p_battery integer DEFAULT NULL,
  p_name text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_rows int;
  v_ima_bat boolean := p_battery IS NOT NULL AND p_battery BETWEEN 0 AND 100;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  UPDATE public.workout_live_state
  SET sensor_battery = CASE WHEN v_ima_bat THEN p_battery ELSE sensor_battery END,
      sensor_battery_at = CASE WHEN v_ima_bat THEN now() ELSE sensor_battery_at END,
      -- Prazan naziv ne brise raniji (iOS ga ume vratiti prazan iz skeniranja).
      sensor_name = COALESCE(NULLIF(btrim(left(p_name, 60)), ''), sensor_name)
  WHERE session_log_id = p_session_id
    AND athlete_id = v_user_id
    AND current_state IN ('active','rest');
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object('success', v_rows > 0);
END $function$;

REVOKE EXECUTE ON FUNCTION public.athlete_report_sensor(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.athlete_report_sensor(uuid, integer, text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_active_athletes_for_trainer();

CREATE FUNCTION public.get_active_athletes_for_trainer()
 RETURNS TABLE(athlete_id uuid, athlete_name text, session_id uuid, started_at timestamp with time zone, duration_seconds integer, current_exercise_name text, current_set_number integer, current_hr integer, current_active_calories numeric, watch_last_hr_at timestamp with time zone, hr_last_at timestamp with time zone, hr_source text, hr_zone integer, hr_zone_name text, current_state text, rest_ends_at timestamp with time zone, total_completed_sets integer, last_heartbeat timestamp with time zone, sensor_battery integer, sensor_battery_at timestamp with time zone, watch_battery integer, watch_battery_at timestamp with time zone, sensor_name text)
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
    wls.watch_battery_at,
    wls.sensor_name
  from public.athletes a
  join public.profiles p on p.id = a.id
  join public.workout_session_logs wsl on wsl.athlete_id = a.id and wsl.is_active = true
  left join public.workout_live_state wls on wls.session_log_id = wsl.id
  where a.trainer_id = auth.uid()
  order by wsl.started_at desc;
$function$;

GRANT EXECUTE ON FUNCTION public.get_active_athletes_for_trainer() TO anon, authenticated, service_role;
