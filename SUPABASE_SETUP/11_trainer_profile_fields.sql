-- ============================================================
-- 11_trainer_profile_fields.sql
-- Profil trenera: bio, studio, grad, specijalnosti, iskustvo, instagram
-- + RLS dozvola da trener ažurira SVOJ red u trainers
-- ============================================================

ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS bio               text,
  ADD COLUMN IF NOT EXISTS studio_name       text,
  ADD COLUMN IF NOT EXISTS city              text,
  ADD COLUMN IF NOT EXISTS specialties       text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS years_experience  smallint,
  ADD COLUMN IF NOT EXISTS instagram_handle  text;

-- years_experience sanity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trainers_years_chk'
  ) THEN
    ALTER TABLE public.trainers
      ADD CONSTRAINT trainers_years_chk
      CHECK (years_experience IS NULL OR years_experience BETWEEN 0 AND 80);
  END IF;
END$$;

-- Trener čita i menja svoj red (idempotent)
DROP POLICY IF EXISTS "trainer reads own row" ON public.trainers;
CREATE POLICY "trainer reads own row"
  ON public.trainers FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "trainer updates own row" ON public.trainers;
CREATE POLICY "trainer updates own row"
  ON public.trainers FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Vežbač sme da čita osnovne podatke svog trenera (bez selekcije osetljivih kolona).
-- Pošto RLS ne radi po kolonama, dozvoljavamo SELECT ako je current user vežbač tog trenera.
DROP POLICY IF EXISTS "athlete reads own trainer" ON public.trainers;
CREATE POLICY "athlete reads own trainer"
  ON public.trainers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.id = auth.uid()
        AND a.trainer_id = trainers.id
    )
  );
