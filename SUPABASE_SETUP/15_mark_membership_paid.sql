-- 15_mark_membership_paid.sql
-- Vežbač može da označi pending zahtev kao "platio sam" → trener dobija notifikaciju.
-- Pokrenuti u Supabase SQL Editor.

-- 1) Dodaj kolonu (ako ne postoji) za vreme kad je vežbač označio uplatu
ALTER TABLE public.membership_purchases
  ADD COLUMN IF NOT EXISTS payment_marked_at timestamptz;

-- 2) RPC: vežbač označava da je platio
CREATE OR REPLACE FUNCTION public.mark_membership_paid(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pur       public.membership_purchases%ROWTYPE;
  v_athlete_name text;
BEGIN
  SELECT * INTO v_pur
    FROM public.membership_purchases
   WHERE id = p_purchase_id
     AND athlete_id = auth.uid()
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Zahtev ne postoji ili više nije na čekanju';
  END IF;

  IF v_pur.payment_marked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Već si označio ovaj zahtev kao plaćen';
  END IF;

  UPDATE public.membership_purchases
     SET payment_marked_at = now()
   WHERE id = p_purchase_id;

  -- Ime vežbača za telo notifikacije
  SELECT COALESCE(NULLIF(TRIM(full_name), ''), 'Vežbač')
    INTO v_athlete_name
    FROM public.profiles
   WHERE id = v_pur.athlete_id;

  -- Notifikacija treneru
  BEGIN
    INSERT INTO public.notifications (user_id, kind, title, body, recipient_role)
    VALUES (
      v_pur.trainer_id,
      'payment_marked',
      'Vežbač potvrdio uplatu',
      COALESCE(v_athlete_name, 'Vežbač') || ' je označio uplatu za "' ||
        v_pur.package_name || '" (' || v_pur.price_rsd || ' RSD). Potvrdi prijem.',
      'trainer'
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_membership_paid(uuid) TO authenticated;

-- 3) Dozvoli novi 'kind' u check constraint-u (ako postoji)
DO $$
DECLARE v_conname text;
BEGIN
  SELECT conname INTO v_conname
    FROM pg_constraint
   WHERE conrelid = 'public.notifications'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%kind%';
  IF v_conname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.notifications DROP CONSTRAINT ' || quote_ident(v_conname);
  END IF;
END $$;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
    'booking_created','booking_canceled','booking_status_canceled',
    'payment_request','payment_marked','membership_activated','membership_rejected',
    'broadcast','generic'
  ));
