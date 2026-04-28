-- ============================================================
-- 04_body_metrics.sql
-- Telesna merenja vežbača: težina, % masti, opcione napomene
-- ============================================================

CREATE TABLE IF NOT EXISTS public.body_metrics (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recorded_on  date NOT NULL DEFAULT CURRENT_DATE,
  weight_kg    numeric(5,2),
  body_fat_pct numeric(4,1),
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bm_athlete_date ON public.body_metrics(athlete_id, recorded_on DESC);

ALTER TABLE public.body_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "athlete rw own metrics" ON public.body_metrics;
CREATE POLICY "athlete rw own metrics"
  ON public.body_metrics FOR ALL
  USING (athlete_id = auth.uid())
  WITH CHECK (athlete_id = auth.uid());

DROP POLICY IF EXISTS "trainer reads athlete metrics" ON public.body_metrics;
CREATE POLICY "trainer reads athlete metrics"
  ON public.body_metrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.id = body_metrics.athlete_id
        AND a.trainer_id = auth.uid()
    )
  );
