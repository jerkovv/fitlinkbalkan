CREATE OR REPLACE FUNCTION public.trainer_memberships_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trainer uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_trainer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT jsonb_build_object('success', true, 'memberships', coalesce(jsonb_agg(r.row), '[]'::jsonb))
    INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'membership_id', m.id,
      'athlete_id', a.id,
      'athlete_name', p.full_name,
      'avatar_url', p.avatar_url,
      'plan_name', m.plan_name,
      'price', m.price,
      'status', m.status::text,
      'starts_on', m.starts_on,
      'ends_on', m.ends_on,
      'days_left', CASE WHEN m.ends_on IS NULL THEN NULL ELSE (m.ends_on - now()::date) END,
      'sessions_total', m.sessions_total,
      'sessions_used', m.sessions_used,
      'sessions_left', CASE WHEN m.sessions_total IS NULL THEN NULL
                            ELSE m.sessions_total - coalesce(m.sessions_used, 0) END,
      'memberships_count', coalesce(mc.cnt, 0),
      'last_workout_at', w.last_workout_at,
      'days_since_last', CASE WHEN w.last_workout_at IS NULL THEN NULL
                              ELSE (now()::date - w.last_workout_at::date) END,
      'workouts_30d', coalesce(w.workouts_30d, 0),
      'risk', CASE
        WHEN w.last_workout_at IS NULL THEN 'high'
        WHEN now() - w.last_workout_at > interval '14 days' THEN 'high'
        WHEN now() - w.last_workout_at > interval '7 days' THEN 'medium'
        ELSE 'low'
      END
    ) AS row
    FROM public.athletes a
    LEFT JOIN public.profiles p ON p.id = a.id
    LEFT JOIN LATERAL (
      SELECT mm.*
      FROM public.memberships mm
      WHERE mm.athlete_id = a.id
        AND mm.trainer_id = v_trainer
      ORDER BY (mm.status = 'active') DESC, mm.ends_on DESC NULLS LAST, mm.created_at DESC
      LIMIT 1
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS cnt
      FROM public.memberships mm2
      WHERE mm2.athlete_id = a.id AND mm2.trainer_id = v_trainer
    ) mc ON true
    LEFT JOIN (
      SELECT athlete_id,
             max(completed_at) AS last_workout_at,
             count(*) FILTER (WHERE completed_at >= now() - interval '30 days') AS workouts_30d
      FROM public.workout_session_logs
      WHERE completed_at IS NOT NULL
      GROUP BY athlete_id
    ) w ON w.athlete_id = a.id
    WHERE a.trainer_id = v_trainer
    ORDER BY p.full_name NULLS LAST
  ) r;

  RETURN v_result;
END
$$;

GRANT EXECUTE ON FUNCTION public.trainer_memberships_overview() TO anon, authenticated, service_role;
