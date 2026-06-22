CREATE OR REPLACE FUNCTION public.watch_compute_position(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_day_id uuid;
  v_row record;
  v_set_number int;
  v_per_set_rest int;
  v_rest int;
BEGIN
  SELECT day_id INTO v_day_id FROM public.workout_session_logs WHERE id = p_session_id;
  IF v_day_id IS NULL THEN
    RETURN jsonb_build_object('complete', true, 'error', 'no_session');
  END IF;

  WITH plan AS (
    SELECT ape.id AS ape_id,
           ape.position,
           (row_number() OVER (ORDER BY ape.position) - 1)::int AS exercise_idx,
           ape.sets,
           COALESCE(ape.rest_seconds, 60) AS rest_seconds,
           CASE WHEN ape.reps ~ '^[0-9]+$' THEN ape.reps::int ELSE NULL END AS planned_reps,
           ape.weight_kg AS planned_weight,
           ape.duration_minutes AS planned_duration_minutes,
           COALESCE(e.is_duration_based, false) AS is_duration_based,
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
    SELECT p.*, COALESCE(d.done_count, 0) AS done_count
    FROM plan p LEFT JOIN done d ON d.ape_id = p.ape_id
  )
  SELECT * INTO v_row
  FROM merged
  WHERE done_count < sets
  ORDER BY position
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('complete', true);
  END IF;

  v_set_number := (v_row.done_count + 1)::int;

  -- per-set pauza ako postoji za tacno taj set, inace parent rest_seconds
  SELECT aps.rest_seconds INTO v_per_set_rest
  FROM public.assigned_program_exercise_sets aps
  WHERE aps.assigned_exercise_id = v_row.ape_id
    AND aps.set_number = v_set_number;

  v_rest := COALESCE(v_per_set_rest, v_row.rest_seconds);

  RETURN jsonb_build_object(
    'complete', false,
    'ape_id', v_row.ape_id,
    'exercise_idx', v_row.exercise_idx,
    'set_number', v_set_number,
    'total_sets', v_row.sets,
    'rest_seconds', v_rest,
    'exercise_name', v_row.exercise_name,
    'planned_reps', v_row.planned_reps,
    'planned_weight', v_row.planned_weight,
    'planned_duration_minutes', v_row.planned_duration_minutes,
    'is_duration_based', v_row.is_duration_based
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.watch_compute_position(uuid) TO public, anon, authenticated, service_role;
