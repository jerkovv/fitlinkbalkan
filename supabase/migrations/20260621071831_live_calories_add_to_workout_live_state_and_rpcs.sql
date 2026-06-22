-- 1) Kolona za zive kalorije u live state
ALTER TABLE public.workout_live_state
  ADD COLUMN IF NOT EXISTS current_active_calories numeric;

-- 2) watch_update_workout_hr: dodaj opcioni p_active_calories i upisi ga
DROP FUNCTION IF EXISTS public.watch_update_workout_hr(text, integer, uuid);

CREATE OR REPLACE FUNCTION public.watch_update_workout_hr(
  p_token text,
  p_heart_rate integer,
  p_session_id uuid,
  p_active_calories numeric DEFAULT NULL
)
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

  UPDATE public.workout_live_state
  SET current_hr = p_heart_rate,
      current_active_calories = CASE
        WHEN p_active_calories IS NOT NULL AND p_active_calories >= 0
          THEN p_active_calories
        ELSE current_active_calories
      END,
      last_heartbeat = now(),
      watch_last_hr_at = now()
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

-- 3) get_active_athletes_for_trainer: vrati i current_active_calories
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
