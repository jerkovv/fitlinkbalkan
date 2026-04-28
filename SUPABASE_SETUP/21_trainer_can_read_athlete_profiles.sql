-- =====================================================================
-- 21_trainer_can_read_athlete_profiles.sql
-- Trener mora da vidi profile svojih vežbača (full_name, phone, email).
-- Bez ovoga svuda u UI piše "Bez imena".
-- =====================================================================

-- Helper: da li je _profile_id vežbač trenera _trainer_id?
CREATE OR REPLACE FUNCTION public.is_trainer_of(_trainer_id uuid, _athlete_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.athletes a
    WHERE a.id = _athlete_id
      AND a.trainer_id = _trainer_id
  );
$$;

-- RLS policy: trener čita profile svojih vežbača
DROP POLICY IF EXISTS "trainer reads athlete profiles" ON public.profiles;
CREATE POLICY "trainer reads athlete profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    public.is_trainer_of(auth.uid(), id)
  );

-- Vežbač treba da vidi profil svog trenera (za "Tvoj trener" karticu)
DROP POLICY IF EXISTS "athlete reads own trainer profile" ON public.profiles;
CREATE POLICY "athlete reads own trainer profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.id = auth.uid()
        AND a.trainer_id = profiles.id
    )
  );
