-- Trener statistika vezbaca: RPC-ovi za pregled liste i pojedinacni profil.
-- Vec primenjeno u bazi (kreirano preko MCP); ova migracija unosi definicije
-- u version-control radi reproducibilnog setup-a. Bezbedno re-runnable
-- (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.get_athlete_stats(p_athlete_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trainer uuid := auth.uid();
  v_total int; v_this_month int; v_last timestamptz; v_last4w int;
  v_volume numeric; v_avg_dur numeric; v_pr_count int; v_best_e1rm numeric;
  v_nutr_days int; v_sessions_total int; v_sessions_used int;
  v_days_since int; v_risk text; v_weekly numeric;
  v_total_kcal numeric; v_avg_kcal numeric; v_kcal_sessions int;
BEGIN
  IF v_trainer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = p_athlete_id AND a.trainer_id = v_trainer) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE completed_at >= date_trunc('month', now())),
         max(completed_at),
         count(*) FILTER (WHERE completed_at >= now() - interval '28 days'),
         coalesce(sum(total_volume_kg), 0),
         avg(duration_seconds)
    INTO v_total, v_this_month, v_last, v_last4w, v_volume, v_avg_dur
  FROM public.workout_session_logs
  WHERE athlete_id = p_athlete_id AND completed_at IS NOT NULL;

  v_weekly := round((coalesce(v_last4w, 0)::numeric / 4.0), 1);
  v_days_since := CASE WHEN v_last IS NULL THEN NULL ELSE (now()::date - v_last::date) END;
  v_risk := CASE
    WHEN v_last IS NULL THEN 'high'
    WHEN now() - v_last > interval '14 days' THEN 'high'
    WHEN now() - v_last > interval '7 days' THEN 'medium'
    ELSE 'low'
  END;

  SELECT count(*), max(best_e1rm_kg) INTO v_pr_count, v_best_e1rm
  FROM public.personal_records WHERE athlete_id = p_athlete_id;

  SELECT count(DISTINCT log_date) INTO v_nutr_days
  FROM public.nutrition_logs
  WHERE athlete_id = p_athlete_id AND log_date >= (now() - interval '30 days')::date;

  SELECT sessions_total, sessions_used INTO v_sessions_total, v_sessions_used
  FROM public.memberships
  WHERE athlete_id = p_athlete_id AND status::text = 'active'
  ORDER BY ends_on DESC NULLS LAST LIMIT 1;

  SELECT coalesce(sum(active_calories), 0),
         avg(active_calories) FILTER (WHERE active_calories > 0),
         count(*) FILTER (WHERE active_calories > 0)
    INTO v_total_kcal, v_avg_kcal, v_kcal_sessions
  FROM public.wearable_workout_details
  WHERE user_id = p_athlete_id AND active_calories IS NOT NULL;

  RETURN jsonb_build_object(
    'success', true,
    'total_workouts', coalesce(v_total, 0),
    'workouts_this_month', coalesce(v_this_month, 0),
    'weekly_avg', coalesce(v_weekly, 0),
    'last_workout_at', v_last,
    'days_since_last', v_days_since,
    'risk', v_risk,
    'total_volume_kg', round(coalesce(v_volume, 0)),
    'avg_duration_min', CASE WHEN v_avg_dur IS NULL THEN NULL ELSE round(v_avg_dur / 60.0) END,
    'pr_count', coalesce(v_pr_count, 0),
    'best_e1rm_kg', v_best_e1rm,
    'nutrition_days_30', coalesce(v_nutr_days, 0),
    'sessions_total', v_sessions_total,
    'sessions_used', v_sessions_used,
    'total_kcal', round(coalesce(v_total_kcal, 0)),
    'avg_kcal', CASE WHEN v_avg_kcal IS NULL THEN NULL ELSE round(v_avg_kcal) END,
    'kcal_sessions', coalesce(v_kcal_sessions, 0)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.get_athletes_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trainer uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_trainer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT jsonb_build_object('success', true, 'athletes', coalesce(jsonb_agg(r.row), '[]'::jsonb))
    INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'athlete_id', a.id,
      'last_workout_at', w.last_workout_at,
      'days_since_last', CASE WHEN w.last_workout_at IS NULL THEN NULL ELSE (now()::date - w.last_workout_at::date) END,
      'workouts_30d', coalesce(w.workouts_30d, 0),
      'risk', CASE
        WHEN w.last_workout_at IS NULL THEN 'high'
        WHEN now() - w.last_workout_at > interval '14 days' THEN 'high'
        WHEN now() - w.last_workout_at > interval '7 days' THEN 'medium'
        ELSE 'low'
      END
    ) AS row
    FROM public.athletes a
    LEFT JOIN (
      SELECT athlete_id,
             max(completed_at) AS last_workout_at,
             count(*) FILTER (WHERE completed_at >= now() - interval '30 days') AS workouts_30d
      FROM public.workout_session_logs
      WHERE completed_at IS NOT NULL
      GROUP BY athlete_id
    ) w ON w.athlete_id = a.id
    WHERE a.trainer_id = v_trainer
  ) r;

  RETURN v_result;
END $function$;
