-- =====================================================================
-- 28_public_landing_and_referral.sql
-- 1) Public slug + headline + avatar_url na trainers
-- 2) referred_by_athlete_id na invites/athletes (tracking)
-- 3) Public RPC: get_trainer_public_profile(slug) — bez auth-a
-- =====================================================================

-- citext za case-insensitive slug
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------
-- 1) Trainers public fields
-- ---------------------------------------------------------------------
ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS public_slug      citext,
  ADD COLUMN IF NOT EXISTS headline         text,
  ADD COLUMN IF NOT EXISTS avatar_url       text,
  ADD COLUMN IF NOT EXISTS public_enabled   boolean NOT NULL DEFAULT true;

-- citext extension za case-insensitive slug
CREATE EXTENSION IF NOT EXISTS citext;

-- Slug pravila: 3-40 chars, lower alnum + hyphen, ne počinje/završava sa hyphen
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainers_slug_format') THEN
    ALTER TABLE public.trainers
      ADD CONSTRAINT trainers_slug_format
      CHECK (public_slug IS NULL OR public_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$');
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_trainers_public_slug
  ON public.trainers(public_slug)
  WHERE public_slug IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2) Referral tracking — ko je doveo koga
-- ---------------------------------------------------------------------
ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS referred_by_athlete_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS referred_by_athlete_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signup_source text;
  -- signup_source: 'invite_email' | 'invite_link' | 'public_landing' | 'referral'

CREATE INDEX IF NOT EXISTS idx_athletes_referred_by
  ON public.athletes(referred_by_athlete_id) WHERE referred_by_athlete_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3) Public RPC — vraća profil + aktivne pakete za /t/:slug
-- Bez auth-a (anon GRANT). Nikad ne vraća email/phone/bank.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_trainer_public_profile(p_slug text)
RETURNS TABLE (
  trainer_id        uuid,
  full_name         text,
  studio_name       text,
  city              text,
  bio               text,
  headline          text,
  avatar_url        text,
  specialties       text[],
  years_experience  smallint,
  instagram_handle  text,
  invite_code       text,
  packages          jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id AS trainer_id,
    p.full_name,
    t.studio_name,
    t.city,
    t.bio,
    t.headline,
    t.avatar_url,
    t.specialties,
    t.years_experience,
    t.instagram_handle,
    t.invite_code,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', mp.id,
            'name', mp.name,
            'sessions_count', mp.sessions_count,
            'duration_days', mp.duration_days,
            'price_rsd', mp.price_rsd
          )
          ORDER BY mp.price_rsd
        )
        FROM public.membership_packages mp
        WHERE mp.trainer_id = t.id AND mp.is_active = true
      ),
      '[]'::jsonb
    ) AS packages
  FROM public.trainers t
  LEFT JOIN public.profiles p ON p.id = t.id
  WHERE t.public_slug = p_slug::citext
    AND COALESCE(t.public_enabled, true) = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_trainer_public_profile(text) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) Trener referral statistika (ko je koga doveo, koliko aktivnih)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_referral_stats()
RETURNS TABLE (
  referrer_id       uuid,
  referrer_name     text,
  referred_count    int,
  referred_active   int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.referred_by_athlete_id AS referrer_id,
    p.full_name              AS referrer_name,
    COUNT(*)::int            AS referred_count,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.athlete_id = a.id AND m.status = 'active'
      )
    )::int AS referred_active
  FROM public.athletes a
  LEFT JOIN public.profiles p ON p.id = a.referred_by_athlete_id
  WHERE a.trainer_id = auth.uid()
    AND a.referred_by_athlete_id IS NOT NULL
  GROUP BY a.referred_by_athlete_id, p.full_name
  ORDER BY referred_count DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_referral_stats() TO authenticated;
