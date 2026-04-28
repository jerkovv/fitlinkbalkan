-- ============================================================
-- 10_athlete_profile_fields.sql
-- Dodatna polja za vežbača: godina rođenja, pol, beleške
-- + RLS dozvola da vežbač ažurira SVOJ red u athletes
-- ============================================================

ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS birth_year smallint,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS notes  text;

-- birth_year sanity (1900..tekuća godina)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'athletes_birth_year_chk'
  ) THEN
    ALTER TABLE public.athletes
      ADD CONSTRAINT athletes_birth_year_chk
      CHECK (birth_year IS NULL OR (birth_year BETWEEN 1900 AND EXTRACT(year FROM now())::int));
  END IF;
END$$;

-- gender enum-like check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'athletes_gender_chk'
  ) THEN
    ALTER TABLE public.athletes
      ADD CONSTRAINT athletes_gender_chk
      CHECK (gender IS NULL OR gender IN ('male','female','other'));
  END IF;
END$$;

-- Vežbač sme da menja SVOJ red (ne sme menjati trainer_id)
DROP POLICY IF EXISTS "athlete updates own row" ON public.athletes;
CREATE POLICY "athlete updates own row"
  ON public.athletes FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND trainer_id = (SELECT trainer_id FROM public.athletes WHERE id = auth.uid()));

-- Vežbač sme da čita svoj red (verovatno već postoji, idempotent)
DROP POLICY IF EXISTS "athlete reads own row" ON public.athletes;
CREATE POLICY "athlete reads own row"
  ON public.athletes FOR SELECT
  USING (id = auth.uid() OR trainer_id = auth.uid());
