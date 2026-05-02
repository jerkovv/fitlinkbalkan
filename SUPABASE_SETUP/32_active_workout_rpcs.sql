-- ============================================================
-- 32_active_workout_rpcs.sql
-- RPCs i kolone za Active Workout 2.0
-- ============================================================

-- Dodaj kolone na workout_session_logs ako fale
ALTER TABLE public.workout_session_logs
  ADD COLUMN IF NOT EXISTS total_volume_kg numeric(10,2),
  ADD COLUMN IF NOT EXISTS active_calories numeric(8,2),
  ADD COLUMN IF NOT EXISTS live_hr_avg int,
  ADD COLUMN IF NOT EXISTS live_hr_max int,
  ADD COLUMN IF NOT EXISTS live_hr_min int,
  ADD COLUMN IF NOT EXISTS hr_series jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'in_progress';

-- Dodaj kolone na set_logs ako fale
ALTER TABLE public.set_logs
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS actual_rest_seconds int;

-- ============================================================
-- start_workout_session(p_assigned_program_id, p_day_id) -> uuid
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_workout_session(
  p_assigned_program_id uuid,
  p_day_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_day_number int;
  v_owner uuid;
  v_session_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT ap.athlete_id INTO v_owner
  FROM assigned_programs ap
  WHERE ap.id = p_assigned_program_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Program not found';
  END IF;

  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT apd.day_number INTO v_day_number
  FROM assigned_program_days apd
  WHERE apd.id = p_day_id AND apd.assigned_program_id = p_assigned_program_id;

  IF v_day_number IS NULL THEN
    RAISE EXCEPTION 'Day not found for this program';
  END IF;

  -- Reuse postojeću otvorenu sesiju ako postoji (zadnjih 6h, isti dan)
  SELECT id INTO v_session_id
  FROM workout_session_logs
  WHERE athlete_id = v_uid
    AND assigned_program_id = p_assigned_program_id
    AND day_id = p_day_id
    AND completed_at IS NULL
    AND started_at > now() - interval '6 hours'
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_session_id IS NOT NULL THEN
    RETURN v_session_id;
  END IF;

  INSERT INTO workout_session_logs (
    athlete_id, assigned_program_id, day_id, day_number, started_at, status
  ) VALUES (
    v_uid, p_assigned_program_id, p_day_id, v_day_number, now(), 'in_progress'
  )
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_workout_session(uuid, uuid) TO authenticated;

-- ============================================================
-- complete_workout_session
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_workout_session(
  p_session_id uuid,
  p_hr_avg int DEFAULT NULL,
  p_hr_max int DEFAULT NULL,
  p_hr_min int DEFAULT NULL,
  p_active_calories numeric DEFAULT NULL,
  p_hr_series jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_started timestamptz;
  v_volume numeric;
BEGIN
  SELECT athlete_id, started_at INTO v_owner, v_started
  FROM workout_session_logs
  WHERE id = p_session_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(SUM(reps * weight_kg), 0) INTO v_volume
  FROM set_logs
  WHERE session_log_id = p_session_id AND done = true;

  UPDATE workout_session_logs
  SET completed_at = now(),
      duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - v_started))::int),
      total_volume_kg = v_volume,
      live_hr_avg = COALESCE(p_hr_avg, live_hr_avg),
      live_hr_max = COALESCE(p_hr_max, live_hr_max),
      live_hr_min = COALESCE(p_hr_min, live_hr_min),
      active_calories = COALESCE(p_active_calories, active_calories),
      hr_series = COALESCE(p_hr_series, hr_series),
      status = 'completed'
  WHERE id = p_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_workout_session(uuid, int, int, int, numeric, jsonb) TO authenticated;

-- ============================================================
-- cancel_workout_session
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancel_workout_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
BEGIN
  SELECT athlete_id INTO v_owner
  FROM workout_session_logs
  WHERE id = p_session_id;

  IF v_owner IS NULL THEN
    RETURN;
  END IF;

  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Obriši sesiju (CASCADE briše set_logs)
  DELETE FROM workout_session_logs WHERE id = p_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_workout_session(uuid) TO authenticated;

-- ============================================================
-- get_workout_day_full(p_day_id) -> JSON sa danom + vežbama
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_workout_day_full(p_day_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT ap.athlete_id INTO v_owner
  FROM assigned_program_days apd
  JOIN assigned_programs ap ON ap.id = apd.assigned_program_id
  WHERE apd.id = p_day_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Day not found';
  END IF;

  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_build_object(
    'day_id', apd.id,
    'day_number', apd.day_number,
    'day_name', apd.name,
    'assigned_program_id', apd.assigned_program_id,
    'exercises', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ape.id,
          'position', ape.position,
          'sets', ape.sets,
          'reps', ape.reps,
          'weight_kg', ape.weight_kg,
          'rest_seconds', ape.rest_seconds,
          'exercise_id', ape.exercise_id,
          'exercise', jsonb_build_object(
            'name', e.name,
            'primary_muscle', e.primary_muscle,
            'video_url', e.video_url,
            'thumbnail_url', e.thumbnail_url,
            'instructions', e.instructions
          )
        )
        ORDER BY ape.position
      )
      FROM assigned_program_exercises ape
      LEFT JOIN exercises e ON e.id = ape.exercise_id
      WHERE ape.day_id = apd.id
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM assigned_program_days apd
  WHERE apd.id = p_day_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workout_day_full(uuid) TO authenticated;
