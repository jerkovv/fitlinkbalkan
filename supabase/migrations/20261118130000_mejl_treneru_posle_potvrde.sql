-- Mejl treneru cim potvrdi adresu: pretplata se pokrece na sajtu (fitlink.rs/pretplata),
-- ne u aplikaciji, a aplikacija se posle toga otkljuca sama.
-- Salje ga edge funkcija send-app-email (dogadjaj trainer_billing_intro), ista kojom idu
-- mejlovi o clanarini i isteku pretplate.
--
-- Okida se tacno jednom po nalogu: kad email_confirmed_at predje sa NULL na vrednost.
-- Vezbaci ga ne dobijaju (provera uloge), kao ni trener koji je pretplatu vec pokrenuo
-- na sajtu pre potvrde. Stari nalozi ga ne dobijaju unazad.
-- Greska u slanju nikad ne sme da zaustavi potvrdu naloga, pa je sve u EXCEPTION bloku.

CREATE OR REPLACE FUNCTION public.tg_trener_mejl_pretplata_na_sajtu()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = NEW.id AND ur.role = 'trainer'
  ) THEN
    RETURN NEW;
  END IF;

  IF public.trainer_has_active_fitlink_sub(NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://iyvvskywmqtudafapxdk.supabase.co/functions/v1/send-app-email',
    body := jsonb_build_object('event', 'trainer_billing_intro', 'athlete_id', NEW.id),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.tg_trener_mejl_pretplata_na_sajtu() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.tg_trener_mejl_pretplata_na_sajtu();
