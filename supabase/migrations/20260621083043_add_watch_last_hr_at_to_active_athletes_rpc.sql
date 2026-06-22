DROP FUNCTION IF EXISTS public.get_active_athletes_for_trainer();

CREATE OR REPLACE FUNCTION public.get_active_athletes_for_trainer()
RETURNS TABLE(
  athlete_id uuid,
  athlete_name text,
  session_id uuid,
  started_at timestamp with time zone,
  duration_seconds integer,
  current_exercise_name text,
  current_set_number integer,
  current_hr integer,
  current_active_calories numeric,
  watch_last_hr_at timestamp with time zone,
  hr_zone integer,
  hr_zone_name text,
  current_state text,
  rest_ends_at timestamp with time zone,
  total_completed_sets integer,
  last_heartbeat timestamp with time zone
)
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
    public.hr_zone(wls.current_hr, public.athlete_effective_max_hr(a.id)) as hr_zone,
    public.hr_zone_name(public.hr_zone(wls.current_hr, public.athlete_effective_max_hr(a.id))) as hr_zone_name,
    wls.current_state,
    wls.rest_ends_at,
    coalesce(wls.total_completed_sets, 0) as total_completed_sets,
    coalesce(wls.last_heartbeat, wsl.started_at) as last_heartbeat
  from public.athletes a
  join public.profiles p on p.id = a.id
  join public.workout_session_logs wsl on wsl.athlete_id = a.id and wsl.is_active = true
  left join public.workout_live_state wls on wls.session_log_id = wsl.id
  where a.trainer_id = auth.uid()
  order by wsl.started_at desc;
$function$;

GRANT EXECUTE ON FUNCTION public.get_active_athletes_for_trainer() TO public, anon, authenticated, service_role;
