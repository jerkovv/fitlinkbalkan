-- ============================================================
-- 05_trainer_sessions.sql
-- Trener zakazuje 1-on-1 sesije sa vežbačima
-- ============================================================

CREATE TABLE IF NOT EXISTS public.trainer_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  duration_min int NOT NULL DEFAULT 60,
  location    text,
  notes       text,
  status      text NOT NULL DEFAULT 'scheduled', -- scheduled | done | canceled
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ts_trainer_date ON public.trainer_sessions(trainer_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_ts_athlete_date ON public.trainer_sessions(athlete_id, scheduled_at);

ALTER TABLE public.trainer_sessions ENABLE ROW LEVEL SECURITY;

-- Trener: pun pristup svojim sesijama
DROP POLICY IF EXISTS "trainer rw own sessions" ON public.trainer_sessions;
CREATE POLICY "trainer rw own sessions"
  ON public.trainer_sessions FOR ALL
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid());

-- Vežbač: vidi sesije zakazane za njega
DROP POLICY IF EXISTS "athlete reads own sessions" ON public.trainer_sessions;
CREATE POLICY "athlete reads own sessions"
  ON public.trainer_sessions FOR SELECT
  USING (athlete_id = auth.uid());
