-- Admin uvid u sve vezbace jednog trenera: aktivnost, clanarina, istorija placanja.
-- Koristi ga admin panel na detalju trenera.

CREATE OR REPLACE FUNCTION public.admin_trainer_athletes_detail(p_trainer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_admin');
  END IF;

  SELECT jsonb_build_object('success', true, 'athletes', coalesce(jsonb_agg(r.row), '[]'::jsonb))
    INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'athlete_id', a.id,
      'full_name', p.full_name,
      'avatar_url', p.avatar_url,
      'joined_at', a.joined_at,
      'last_workout_at', w.last_workout_at,
      'workouts_30d', coalesce(w.workouts_30d, 0),
      'risk', CASE
        WHEN w.last_workout_at IS NULL THEN 'high'
        WHEN now() - w.last_workout_at > interval '14 days' THEN 'high'
        WHEN now() - w.last_workout_at > interval '7 days' THEN 'medium'
        ELSE 'low'
      END,
      'membership', CASE WHEN m.id IS NULL THEN NULL ELSE jsonb_build_object(
        'plan_name', m.plan_name,
        'price', m.price,
        'status', m.status::text,
        'ends_on', m.ends_on,
        'days_left', CASE WHEN m.ends_on IS NULL THEN NULL ELSE (m.ends_on - now()::date) END,
        'sessions_total', m.sessions_total,
        'sessions_used', m.sessions_used
      ) END,
      'paid_count', coalesce(pc.paid_count, 0),
      'paid_total_rsd', coalesce(pc.paid_total_rsd, 0)
    ) AS row
    FROM public.athletes a
    LEFT JOIN public.profiles p ON p.id = a.id
    LEFT JOIN LATERAL (
      SELECT mm.* FROM public.memberships mm
      WHERE mm.athlete_id = a.id AND mm.trainer_id = p_trainer_id
      ORDER BY (mm.status = 'active') DESC, mm.ends_on DESC NULLS LAST, mm.created_at DESC
      LIMIT 1
    ) m ON true
    LEFT JOIN (
      SELECT athlete_id, max(completed_at) AS last_workout_at,
        count(*) FILTER (WHERE completed_at >= now() - interval '30 days') AS workouts_30d
      FROM public.workout_session_logs
      WHERE completed_at IS NOT NULL
      GROUP BY athlete_id
    ) w ON w.athlete_id = a.id
    LEFT JOIN (
      SELECT athlete_id, count(*) AS paid_count, sum(price_rsd) AS paid_total_rsd
      FROM public.membership_purchases
      WHERE trainer_id = p_trainer_id AND status = 'confirmed'
      GROUP BY athlete_id
    ) pc ON pc.athlete_id = a.id
    WHERE a.trainer_id = p_trainer_id
    ORDER BY p.full_name NULLS LAST
  ) r;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_trainer_athletes_detail(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_trainer_athletes_detail(uuid) TO authenticated;
