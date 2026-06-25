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
    wls.current_state,
    CASE
      WHEN wls.current_hr IS NULL OR wls.current_hr <= 0 THEN 'rest'
      WHEN wls.current_hr < 110 THEN 'easy'
      WHEN wls.current_hr < 140 THEN 'moderate'
      WHEN wls.current_hr < 165 THEN 'hard'
      ELSE 'max'
    END AS zone
  FROM public.workout_live_state wls
  JOIN public.athletes a ON a.id = wls.athlete_id
  LEFT JOIN public.profiles p ON p.id = wls.athlete_id
  WHERE a.trainer_id = p_trainer_id
    AND wls.current_state IN ('active','rest')
    AND wls.last_heartbeat > now() - interval '5 minutes'
),
ranked AS (
  SELECT active.*,
         row_number() OVER (ORDER BY hr DESC NULLS LAST) AS rn,
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
        'isResting', (current_state = 'rest')
     ) ORDER BY rn)
     FROM ranked WHERE rn <= 3
  ), '[]'::jsonb),
  'activeCount', COALESCE((SELECT max(total) FROM ranked), 0),
  'moreCount', GREATEST(COALESCE((SELECT max(total) FROM ranked), 0) - 3, 0)
);
$function$;
