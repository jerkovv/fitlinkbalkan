-- =====================================================================
-- 24_get_my_athletes_rpc.sql
-- Trener-only RPC koja vraća listu vežbača sa profilom (full_name, email).
-- Koristi se gde RLS na profiles ne uspeva da vrati podatke.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_my_athletes()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  goal text,
  joined_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    p.full_name,
    p.email,
    a.goal,
    a.joined_at
  FROM public.athletes a
  LEFT JOIN public.profiles p ON p.id = a.id
  WHERE a.trainer_id = auth.uid()
  ORDER BY a.joined_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_athletes() TO authenticated;
