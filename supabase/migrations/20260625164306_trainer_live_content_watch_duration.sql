CREATE OR REPLACE FUNCTION public.trainer_live_content(p_trainer_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH active AS (
  SELECT
    COALESCE(p.full_name, 'Vezbac') AS name,
    wls.current_hr AS hr,
    round(wls.current_active_calories)::int AS cal,
    COALESCE(wls.current_state, 'active') AS current_state,
    (wls.watch_last_hr_at IS NOT NULL
       AND wls.watch_last_hr_at > now() - interval '60 seconds') AS watch_connected,
    GREATEST(floor(extract(epoch FROM (now() - wsl.started_at)) / 60)::int, 0) AS duration_min,
    CASE
      WHEN wls.current_hr IS NULL OR wls.current_hr <= 0 THEN 'rest'
      WHEN wls.current_hr < 110 THEN 'easy'
      WHEN wls.current_hr < 140 THEN 'moderate'
      WHEN wls.current_hr < 165 THEN 'hard'
      ELSE 'max'
    END AS zone
  FROM public.athletes a
  JOIN public.workout_session_logs wsl
    ON wsl.athlete_id = a.id AND wsl.is_active = true
  LEFT JOIN public.workout_live_state wls
    ON wls.session_log_id = wsl.id
  LEFT JOIN public.profiles p ON p.id = a.id
  WHERE a.trainer_id = p_trainer_id
),
ranked AS (
  SELECT active.*,
         row_number() OVER (ORDER BY watch_connected DESC, hr DESC NULLS LAST) AS rn,
         count(*) OVER () AS total
  FROM active
)
SELECT jsonb_build_object(
  'athletes', COALESCE((
     SELECT jsonb_agg(jsonb_build_object(
        'name', name,
        'hr', hr,
        'cal', cal,
        'zone', zone,
        'isResting', (current_state = 'rest'),
        'watchConnected', watch_connected,
        'durationMin', duration_min
     ) ORDER BY rn)
     FROM ranked WHERE rn <= 3
  ), '[]'::jsonb),
  'activeCount', COALESCE((SELECT max(total) FROM ranked), 0),
  'moreCount', GREATEST(COALESCE((SELECT max(total) FROM ranked), 0) - 3, 0)
);
$function$;
