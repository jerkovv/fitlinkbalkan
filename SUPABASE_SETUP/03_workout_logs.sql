-- ============================================================
-- 03_workout_logs.sql
-- Tabele za logovanje završenih treninga + RPC za sledeći dan u rotaciji
-- ============================================================

-- 1) Završen (ili u toku) trening — jedan red po sesiji
CREATE TABLE IF NOT EXISTS public.workout_session_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_program_id uuid NOT NULL REFERENCES public.assigned_programs(id) ON DELETE CASCADE,
  day_id          uuid NOT NULL REFERENCES public.assigned_program_days(id) ON DELETE CASCADE,
  day_number      int  NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  duration_seconds int,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wsl_athlete ON public.workout_session_logs(athlete_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wsl_program ON public.workout_session_logs(assigned_program_id);

-- 2) Pojedinačni set u okviru sesije
CREATE TABLE IF NOT EXISTS public.set_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_log_id  uuid NOT NULL REFERENCES public.workout_session_logs(id) ON DELETE CASCADE,
  exercise_id     uuid NOT NULL REFERENCES public.assigned_program_exercises(id) ON DELETE CASCADE,
  set_number      int  NOT NULL,
  reps            int,
  weight_kg       numeric(6,2),
  rpe             numeric(3,1),
  done            boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_log_id, exercise_id, set_number)
);

CREATE INDEX IF NOT EXISTS idx_sl_session ON public.set_logs(session_log_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.workout_session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.set_logs ENABLE ROW LEVEL SECURITY;

-- workout_session_logs: vežbač čita / piše svoje, trener čita svoje vežbače
DROP POLICY IF EXISTS "athlete sees own session logs" ON public.workout_session_logs;
CREATE POLICY "athlete sees own session logs"
  ON public.workout_session_logs FOR SELECT
  USING (athlete_id = auth.uid());

DROP POLICY IF EXISTS "athlete writes own session logs" ON public.workout_session_logs;
CREATE POLICY "athlete writes own session logs"
  ON public.workout_session_logs FOR INSERT
  WITH CHECK (athlete_id = auth.uid());

DROP POLICY IF EXISTS "athlete updates own session logs" ON public.workout_session_logs;
CREATE POLICY "athlete updates own session logs"
  ON public.workout_session_logs FOR UPDATE
  USING (athlete_id = auth.uid());

DROP POLICY IF EXISTS "trainer sees athlete session logs" ON public.workout_session_logs;
CREATE POLICY "trainer sees athlete session logs"
  ON public.workout_session_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.id = workout_session_logs.athlete_id
        AND a.trainer_id = auth.uid()
    )
  );

-- set_logs: kroz session_log
DROP POLICY IF EXISTS "athlete rw own set logs" ON public.set_logs;
CREATE POLICY "athlete rw own set logs"
  ON public.set_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_session_logs s
      WHERE s.id = set_logs.session_log_id AND s.athlete_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_session_logs s
      WHERE s.id = set_logs.session_log_id AND s.athlete_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "trainer reads set logs" ON public.set_logs;
CREATE POLICY "trainer reads set logs"
  ON public.set_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_session_logs s
      JOIN public.athletes a ON a.id = s.athlete_id
      WHERE s.id = set_logs.session_log_id AND a.trainer_id = auth.uid()
    )
  );

-- ============================================================
-- RPC: vrati sledeći dan u rotaciji za vežbača
-- Logika: nađi poslednji KOMPLETIRANI trening, pa vrati next dan u rotaciji
-- Ako nema kompletiranih → Dan 1
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
  -- Najnoviji aktivni dodeljeni program
  SELECT ap.id INTO v_program_id
  FROM assigned_programs ap
  WHERE ap.athlete_id = p_athlete_id
  ORDER BY ap.assigned_at DESC
  LIMIT 1;

  IF v_program_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO v_total_days
  FROM assigned_program_days
  WHERE assigned_program_id = v_program_id;

  IF v_total_days = 0 THEN
    RETURN;
  END IF;

  -- Poslednji kompletirani dan
  SELECT wsl.day_number INTO v_last_day
  FROM workout_session_logs wsl
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
  FROM assigned_programs ap
  JOIN assigned_program_days apd ON apd.assigned_program_id = ap.id
  WHERE ap.id = v_program_id
    AND apd.day_number = v_next_day;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_workout_day(uuid) TO authenticated;
