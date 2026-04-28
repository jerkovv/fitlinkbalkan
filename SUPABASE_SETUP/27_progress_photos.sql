-- =====================================================================
-- 27_progress_photos.sql
-- Progress fotke vežbača: storage bucket + metadata tabela
-- Default: privatno samo vežbaču. Vežbač može toggle "deli sa trenerom".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Storage bucket (privatan — pristup samo preko signed URL)
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('progress-photos', 'progress-photos', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2) Metadata tabela
-- Path konvencija: {athlete_id}/{uuid}.{ext}
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.progress_photos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path        text NOT NULL UNIQUE,
  taken_on            date NOT NULL DEFAULT CURRENT_DATE,
  shared_with_trainer boolean NOT NULL DEFAULT false,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pp_athlete_date
  ON public.progress_photos(athlete_id, taken_on DESC);

ALTER TABLE public.progress_photos ENABLE ROW LEVEL SECURITY;

-- Vežbač čita/piše/menja/briše svoje fotke
DROP POLICY IF EXISTS "athlete rw own photos" ON public.progress_photos;
CREATE POLICY "athlete rw own photos"
  ON public.progress_photos FOR ALL
  USING (athlete_id = auth.uid())
  WITH CHECK (athlete_id = auth.uid());

-- Trener čita SAMO podeljene fotke svojih vežbača
DROP POLICY IF EXISTS "trainer reads shared photos" ON public.progress_photos;
CREATE POLICY "trainer reads shared photos"
  ON public.progress_photos FOR SELECT
  USING (
    shared_with_trainer = true
    AND EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.id = progress_photos.athlete_id
        AND a.trainer_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- 3) Storage RLS na storage.objects za bucket 'progress-photos'
-- Path mora počinjati sa {auth.uid()}/ za upload/delete.
-- ---------------------------------------------------------------------

-- Upload — samo vlasnik foldera
DROP POLICY IF EXISTS "athlete upload own progress photos" ON storage.objects;
CREATE POLICY "athlete upload own progress photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'progress-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Read — vlasnik uvek; trener samo ako je fotka deljena
DROP POLICY IF EXISTS "read own or shared progress photos" ON storage.objects;
CREATE POLICY "read own or shared progress photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'progress-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.progress_photos pp
        JOIN public.athletes a ON a.id = pp.athlete_id
        WHERE pp.storage_path = storage.objects.name
          AND pp.shared_with_trainer = true
          AND a.trainer_id = auth.uid()
      )
    )
  );

-- Delete — samo vlasnik
DROP POLICY IF EXISTS "athlete delete own progress photos" ON storage.objects;
CREATE POLICY "athlete delete own progress photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'progress-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update (npr. metadata) — samo vlasnik
DROP POLICY IF EXISTS "athlete update own progress photos" ON storage.objects;
CREATE POLICY "athlete update own progress photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'progress-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
