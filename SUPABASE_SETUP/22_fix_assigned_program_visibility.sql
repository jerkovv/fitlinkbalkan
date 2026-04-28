-- ============================================================
-- 22_fix_assigned_program_visibility.sql
-- Fix: program je dodeljen, ali vežbač ga ne vidi jer RPC koristi
-- kolonu assigned_programs.created_at koja ne postoji u trenutnoj bazi.
-- Ispravno polje za redosled dodeljenih programa je assigned_at.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_next_workout_day(p_athlete_id uuid)
RETURNS TABLE (
  assigned_program_id uuid,
  program_name text,
  day_id uuid,
  day_number int,
  day_name text,
  total_days int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program_id uuid;
  v_total_days int;
  v_last_day int;
  v_next_day int;
BEGIN
  SELECT ap.id INTO v_program_id
  FROM public.assigned_programs ap
  WHERE ap.athlete_id = p_athlete_id
  ORDER BY ap.assigned_at DESC
  LIMIT 1;

  IF v_program_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO v_total_days
  FROM public.assigned_program_days
  WHERE assigned_program_id = v_program_id;

  IF v_total_days = 0 THEN
    RETURN;
  END IF;

  SELECT wsl.day_number INTO v_last_day
  FROM public.workout_session_logs wsl
  WHERE wsl.athlete_id = p_athlete_id
    AND wsl.assigned_program_id = v_program_id
    AND wsl.completed_at IS NOT NULL
  ORDER BY wsl.completed_at DESC
  LIMIT 1;

  v_next_day := COALESCE((v_last_day % v_total_days) + 1, 1);

  RETURN QUERY
  SELECT
    ap.id,
    ap.name,
    apd.id,
    apd.day_number,
    apd.name,
    v_total_days
  FROM public.assigned_programs ap
  JOIN public.assigned_program_days apd ON apd.assigned_program_id = ap.id
  WHERE ap.id = v_program_id
    AND apd.day_number = v_next_day;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_workout_day(uuid) TO authenticated;