-- Odvajanje TEST naloga od pravih u admin panelu (admin.fitlink.rs).
--
-- Nalozi se NE DIRAJU: ni brisanje, ni izmena mejla, ni gasenje. Oznaka zivi u
-- zasebnoj tabeli koja samo pokazuje NA korisnika. Skidanje oznake vraca nalog
-- medju prave, i to je jedina operacija - podatak o korisniku se nikad ne menja.
--
-- Smer oznacavanja je namerno "oznaci TEST, sve ostalo je pravo": da novi pravi
-- korisnik koji se registruje sutra odmah bude vidljiv. Suprotan smer (spisak
-- pravih) bi svakog novog korisnika tiho sakrio, sto je gore od suvisnog reda.
CREATE TABLE IF NOT EXISTS public.admin_test_accounts (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  marked_at  timestamptz NOT NULL DEFAULT now(),
  marked_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note       text
);

ALTER TABLE public.admin_test_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Samo admin vidi i menja oznake test naloga" ON public.admin_test_accounts;
CREATE POLICY "Samo admin vidi i menja oznake test naloga"
ON public.admin_test_accounts FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

COMMENT ON TABLE public.admin_test_accounts IS
  'Nalozi koje admin panel prikazuje odvojeno od pravih korisnika. Samo oznaka - nalog se ne dira.';

-- Zasejano stanje: sve osim jedinog pravog naloga u trenutku uvodjenja.
-- Idempotentno, i ne dira nijedan nalog - samo upisuje oznake.
INSERT INTO public.admin_test_accounts (user_id, note)
SELECT u.id, 'zasejano pri uvodjenju odvajanja test naloga'
FROM auth.users u
WHERE lower(u.email) <> 'anovic89@icloud.com'
ON CONFLICT (user_id) DO NOTHING;

-- Prebacivanje naloga izmedju "pravi" i "test". Jedini upis koji ova funkcija
-- radi je red u admin_test_accounts - nalog ostaje netaknut u oba smera.
CREATE OR REPLACE FUNCTION public.admin_set_test_account(
  p_user_id uuid,
  p_is_test boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'Nalog ne postoji';
  END IF;

  IF p_is_test THEN
    INSERT INTO public.admin_test_accounts (user_id, marked_by)
    VALUES (p_user_id, auth.uid())
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    DELETE FROM public.admin_test_accounts WHERE user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'is_test', p_is_test);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_test_account(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_test_account(uuid, boolean) TO authenticated;
