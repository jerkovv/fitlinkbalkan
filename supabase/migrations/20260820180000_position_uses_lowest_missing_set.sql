-- Pozicija: PRVA SERIJA KOJA NEDOSTAJE, umesto "broj upisanih + 1".
--
-- Stara racunica je podnosila samo popunjavanje redom. Cim trener u mrezi
-- cekira seriju 2 a serija 1 ostane prazna, dobija se rupa: broj upisanih je 1,
-- pa motor trazi seriju 2 - a ona vec postoji. Upis vezbaca je
-- ON CONFLICT DO NOTHING, brojac se ne pomeri, i vezbac zauvek klikce "Zavrsi
-- set" bez ikakvog pomaka. Sa "prva koja nedostaje" rupe su bezopasne, sto je
-- uslov da trenerova mreza uopste sme da upisuje u proizvoljnu celiju.
CREATE OR REPLACE FUNCTION public.watch_compute_position(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_day_id uuid;
  v_racvan boolean;
  v_row record;
  v_per_set_rest int;
  v_rest int;
BEGIN
  SELECT day_id INTO v_day_id FROM public.workout_session_logs WHERE id = p_session_id;

  SELECT EXISTS (SELECT 1 FROM public.assigned_program_exercises
                 WHERE session_log_id = p_session_id) INTO v_racvan;

  IF v_day_id IS NULL AND NOT v_racvan THEN
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
    WHERE ape.deleted_at IS NULL
      AND (CASE WHEN v_racvan THEN ape.session_log_id = p_session_id
                ELSE ape.day_id = v_day_id END)
  ),
  merged AS (
    SELECT p.*,
           (SELECT min(n) FROM generate_series(1, p.sets) AS n
             WHERE NOT EXISTS (
               SELECT 1 FROM public.set_logs sl
               WHERE sl.session_log_id = p_session_id
                 AND sl.exercise_id = p.ape_id
                 AND sl.set_number = n
                 AND sl.done = true
             )) AS next_set
    FROM plan p
  )
  SELECT * INTO v_row
  FROM merged
  WHERE next_set IS NOT NULL
  ORDER BY position
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('complete', true);
  END IF;

  SELECT aps.rest_seconds INTO v_per_set_rest
  FROM public.assigned_program_exercise_sets aps
  WHERE aps.assigned_exercise_id = v_row.ape_id
    AND aps.set_number = v_row.next_set;

  v_rest := COALESCE(v_per_set_rest, v_row.rest_seconds);

  RETURN jsonb_build_object(
    'complete', false,
    'ape_id', v_row.ape_id,
    'exercise_idx', v_row.exercise_idx,
    'set_number', v_row.next_set,
    'total_sets', v_row.sets,
    'rest_seconds', v_rest,
    'exercise_name', v_row.exercise_name,
    'planned_reps', v_row.planned_reps,
    'planned_weight', v_row.planned_weight,
    'planned_duration_minutes', v_row.planned_duration_minutes,
    'is_duration_based', v_row.is_duration_based
  );
END;
$$;
