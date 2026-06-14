-- watch_get_workout_plan: pun plan dana (vezbe + done_count) za lokalni model treninga na satu
-- (KORAK B). Version-control only: funkcija je vec primenjena u bazi preko MCP-a.
CREATE OR REPLACE FUNCTION public.watch_get_workout_plan(p_token text, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_day_id uuid;
  v_exercises jsonb;
  v_all_done boolean;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.watch_pairing_tokens
  WHERE token = p_token
    AND revoked_at IS NULL
    AND expires_at > now();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  SELECT day_id INTO v_day_id
  FROM public.workout_session_logs
  WHERE id = p_session_id
    AND athlete_id = v_user_id;

  IF v_day_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  WITH plan AS (
    SELECT ape.id AS ape_id,
           ape.position,
           (row_number() OVER (ORDER BY ape.position) - 1)::int AS exercise_idx,
           ape.sets,
           COALESCE(ape.rest_seconds, 60) AS rest_seconds,
           ape.reps AS reps_text,
           CASE WHEN ape.reps ~ '^[0-9]+$' THEN ape.reps::int ELSE NULL END AS planned_reps,
           ape.weight_kg AS planned_weight,
           COALESCE(e.name_en, e.name) AS exercise_name
    FROM public.assigned_program_exercises ape
    JOIN public.exercises e ON e.id = ape.exercise_id
    WHERE ape.day_id = v_day_id
      AND ape.deleted_at IS NULL
  ),
  done AS (
    SELECT exercise_id AS ape_id, count(*) AS done_count
    FROM public.set_logs
    WHERE session_log_id = p_session_id AND done = true
    GROUP BY exercise_id
  ),
  merged AS (
    SELECT p.*, COALESCE(d.done_count, 0)::int AS done_count
    FROM plan p
    LEFT JOIN done d ON d.ape_id = p.ape_id
  )
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'ape_id', m.ape_id,
        'exercise_idx', m.exercise_idx,
        'position', m.position,
        'sets', m.sets,
        'rest_seconds', m.rest_seconds,
        'reps_text', m.reps_text,
        'planned_reps', m.planned_reps,
        'planned_weight', m.planned_weight,
        'exercise_name', m.exercise_name,
        'done_count', m.done_count
      ) ORDER BY m.position
    ),
    bool_and(m.done_count >= m.sets)
  INTO v_exercises, v_all_done
  FROM merged m;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'day_id', v_day_id,
    'server_now_ms', (extract(epoch FROM now()) * 1000)::bigint,
    'complete', COALESCE(v_all_done, true),
    'exercises', COALESCE(v_exercises, '[]'::jsonb)
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.watch_get_workout_plan(text, uuid) TO anon, authenticated;
