-- =====================================================================
-- FitLink: Email invite flow — Supabase migracija
-- =====================================================================
-- Pokreni ovaj SQL u Supabase Dashboard → SQL Editor → New query
-- Dodaje kolone potrebne da se pamti email primaoca i kada je poslat.
-- =====================================================================

ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_invites_email
  ON public.invites(email)
  WHERE email IS NOT NULL;

-- (opciono) Pregled
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'invites';
