-- UGC kreatori: javna prijava sa fitlink.rs/ugc-kreatori.
--
-- Anonimni posetilac sme SAMO da ubaci red (status je uvek 'novo'). Citanje i
-- menjanje statusa ima iskljucivo admin (is_admin(), isti mehanizam kao ostatak
-- admin panela) ili service role. Posle svakog inserta trigger preko pg_net
-- zove edge funkciju notify-ugc-prijava koja salje mejl preko Resend-a
-- (isti obrazac kao tg_membership_activated_email).

CREATE TABLE IF NOT EXISTS public.ugc_prijave (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  status             text NOT NULL DEFAULT 'novo'
                     CHECK (status IN ('novo', 'u_razmatranju', 'odbijeno', 'prihvaceno')),

  -- Osnovno
  ime_prezime        text NOT NULL,
  telefon            text NOT NULL,
  email              text NOT NULL,
  grad_drzava        text NOT NULL,

  -- Profili (instagram/tiktok su goli handle-ovi, bez @ i bez URL-a)
  instagram          text NOT NULL,
  tiktok             text,
  portfolio_link     text,

  -- Sadrzaj iz fitness nise
  linkovi_klipova    text[] NOT NULL CHECK (array_length(linkovi_klipova, 1) BETWEEN 1 AND 10),
  upload_link        text,
  fitness_pozadina   text NOT NULL CHECK (char_length(fitness_pozadina) <= 400),

  -- Cenovnik (EUR)
  cena_1_klip        numeric(10,2) NOT NULL CHECK (cena_1_klip >= 0),
  cena_paket_3       numeric(10,2) CHECK (cena_paket_3 IS NULL OR cena_paket_3 >= 0),
  cena_paket_5       numeric(10,2) CHECK (cena_paket_5 IS NULL OR cena_paket_5 >= 0),
  sta_ulazi_u_cenu   text NOT NULL,
  rok_isporuke_dana  integer NOT NULL CHECK (rok_isporuke_dana >= 1),
  oprema             text,
  dostupnost         text NOT NULL CHECK (dostupnost IN ('Odmah', 'U roku od 7 dana', 'U roku od 30 dana')),

  -- Ostalo
  napomena           text,
  saglasnost         boolean NOT NULL CHECK (saglasnost = true)
);

COMMENT ON TABLE public.ugc_prijave IS
  'Prijave UGC fitness kreatora sa javne stranice fitlink.rs/ugc-kreatori. Anon samo insert, citanje samo admin.';

CREATE INDEX IF NOT EXISTS ugc_prijave_created_at_idx ON public.ugc_prijave (created_at DESC);
CREATE INDEX IF NOT EXISTS ugc_prijave_status_idx ON public.ugc_prijave (status);

ALTER TABLE public.ugc_prijave ENABLE ROW LEVEL SECURITY;

-- Privilegije: anon sme samo insert (nema select ni na nivou granta),
-- authenticated ide kroz RLS (is_admin()), service role ima sve po difoltu.
REVOKE ALL ON public.ugc_prijave FROM anon, authenticated;
GRANT INSERT ON public.ugc_prijave TO anon;
GRANT SELECT, UPDATE ON public.ugc_prijave TO authenticated;

DROP POLICY IF EXISTS "Anon moze da posalje UGC prijavu" ON public.ugc_prijave;
CREATE POLICY "Anon moze da posalje UGC prijavu"
ON public.ugc_prijave FOR INSERT
TO anon
WITH CHECK (status = 'novo');

DROP POLICY IF EXISTS "Admin cita UGC prijave" ON public.ugc_prijave;
CREATE POLICY "Admin cita UGC prijave"
ON public.ugc_prijave FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Admin menja status UGC prijave" ON public.ugc_prijave;
CREATE POLICY "Admin menja status UGC prijave"
ON public.ugc_prijave FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Mejl obavestenje posle inserta (pg_net -> edge funkcija -> Resend).
CREATE OR REPLACE FUNCTION public.tg_ugc_prijava_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net', 'vault'
AS $$
DECLARE
  v_key text;
  v_url text := 'https://iyvvskywmqtudafapxdk.supabase.co/functions/v1/notify-ugc-prijava';
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_key IS NULL THEN
    RETURN new;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object('id', new.id),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 5000
  );

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Mejl nikad ne sme da obori samu prijavu.
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_ugc_prijava_email ON public.ugc_prijave;
CREATE TRIGGER trg_ugc_prijava_email
  AFTER INSERT ON public.ugc_prijave
  FOR EACH ROW EXECUTE FUNCTION public.tg_ugc_prijava_email();
