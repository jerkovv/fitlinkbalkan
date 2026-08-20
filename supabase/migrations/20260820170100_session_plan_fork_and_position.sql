-- Racvanje plana: trening dobija svoju kopiju spiska vezbi.
--
-- Radi se LENJO - tek kad trener prvi put nesto promeni. Trening koji niko ne
-- dira nema nijedan dodatni red i cita sablon kao i do sada.
--
-- Kopiraju se SVI redovi dana, ukljucujuci soft-obrisane. Razlog: set_logs ovog
-- treninga mogu da pokazuju i na red koji je u medjuvremenu obrisan iz sablona,
-- pa bi preslikavanje inace ostalo nepotpuno i serija bi visila o tudjem redu.
--
-- forked_from: kopija zna iz kog sablonskog reda je nastala. Bez toga prva
-- izmena ne bi imala sta da pogodi - klijent u ruci drzi id-jeve iz sablona
-- (plan je ucitao pre racvanja), a kopije dobijaju nove.
ALTER TABLE public.assigned_program_exercises
  ADD COLUMN IF NOT EXISTS forked_from uuid
    REFERENCES public.assigned_program_exercises(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public._fork_session_plan(p_session_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_day uuid; v_broj int;
BEGIN
  SELECT count(*) INTO v_broj FROM public.assigned_program_exercises
  WHERE session_log_id = p_session_id;
  IF v_broj > 0 THEN RETURN 0; END IF;

  SELECT day_id INTO v_day FROM public.workout_session_logs WHERE id = p_session_id;
  IF v_day IS NULL THEN RETURN 0; END IF;

  WITH src AS (
    SELECT ape.*, gen_random_uuid() AS novi_id
    FROM public.assigned_program_exercises ape
    WHERE ape.day_id = v_day
  ),
  ubaci_vezbe AS (
    INSERT INTO public.assigned_program_exercises
      (id, day_id, session_log_id, forked_from, exercise_id, position, sets, reps,
       weight_kg, rest_seconds, notes, deleted_at, duration_minutes)
    SELECT s.novi_id, NULL, p_session_id, s.id, s.exercise_id, s.position, s.sets, s.reps,
           s.weight_kg, s.rest_seconds, s.notes, s.deleted_at, s.duration_minutes
    FROM src s
    RETURNING 1
  ),
  ubaci_serije AS (
    INSERT INTO public.assigned_program_exercise_sets
      (assigned_exercise_id, set_number, reps, weight_kg, rest_seconds, notes)
    SELECT s.novi_id, aps.set_number, aps.reps, aps.weight_kg, aps.rest_seconds, aps.notes
    FROM src s
    JOIN public.assigned_program_exercise_sets aps ON aps.assigned_exercise_id = s.id
    RETURNING 1
  )
  -- Vec upisane serije OVOG treninga moraju da predju na kopije, inace bi
  -- watch_compute_position za nove redove videla nula odradjenih i vratila
  -- vezbaca na prvu seriju prve vezbe.
  UPDATE public.set_logs sl
  SET exercise_id = s.novi_id
  FROM src s
  WHERE sl.session_log_id = p_session_id AND sl.exercise_id = s.id;

  SELECT count(*) INTO v_broj FROM public.assigned_program_exercises
  WHERE session_log_id = p_session_id;
  RETURN v_broj;
END;
$$;

-- Prevodi id koji je poslao klijent (sablonski ILI vec racvani) u red OVOG treninga.
CREATE OR REPLACE FUNCTION public._session_ape(p_session_id uuid, p_ape_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ape.id FROM public.assigned_program_exercises ape
  WHERE ape.session_log_id = p_session_id
    AND ape.deleted_at IS NULL
    AND (ape.id = p_ape_id OR ape.forked_from = p_ape_id)
  LIMIT 1;
$$;

-- Pozicija sada gleda vezbe TRENINGA ako ih ima, inace sablon dana.
-- Jedina izmena u odnosu na raniju verziju je izvor reda u CTE "plan".
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
  v_set_number int;
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
END;
$$;

REVOKE ALL ON FUNCTION public._fork_session_plan(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._fork_session_plan(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public._session_ape(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._session_ape(uuid, uuid) TO authenticated;
