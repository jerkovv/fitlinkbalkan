-- 17_fix_mark_paid_notification.sql
-- Popravka: mark_membership_paid je upisivao u staru šemu (user_id) → trener nije dobijao notifikaciju.
-- Stvarna šema (v2): recipient_id, recipient_role, sender_id, athlete_id, kind, title, body.
-- Pokreni u Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.mark_membership_paid(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pur          public.membership_purchases%ROWTYPE;
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

  SELECT COALESCE(NULLIF(TRIM(full_name), ''), 'Vežbač')
    INTO v_athlete_name
    FROM public.profiles
   WHERE id = v_pur.athlete_id;

  -- Notifikacija treneru (v2 šema)
  INSERT INTO public.notifications
    (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
  VALUES (
    v_pur.trainer_id,
    'trainer',
    v_pur.athlete_id,
    v_pur.athlete_id,
    'payment_marked',
    'Vežbač potvrdio uplatu',
    COALESCE(v_athlete_name, 'Vežbač') || ' je označio uplatu za "' ||
      v_pur.package_name || '" (' || v_pur.price_rsd || ' RSD). Potvrdi prijem.',
    jsonb_build_object('purchase_id', v_pur.id, 'package_name', v_pur.package_name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_membership_paid(uuid) TO authenticated;

-- Dozvoli 'payment_marked' i 'payment_request' u kind check constraint-u
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
    'booking_created','booking_canceled','workout_completed','message',
    'program_assigned','nutrition_assigned','message_from_trainer',
    'membership_expiring','membership_expired','membership_activated','membership_rejected',
    'payment_request','payment_marked',
    'broadcast','generic'
  ));
