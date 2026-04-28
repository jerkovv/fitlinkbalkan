-- 19_cancellation_policy.sql
-- Trener postavlja minimalni rok pre termina za otkazivanje rezervacije.
--   cancel_cutoff_hours = 0  → otkazivanje je dozvoljeno do početka termina
--   cancel_cutoff_hours = 24 → otkazivanje samo 24h+ unapred
-- Pokreni u Supabase SQL Editor.

-- 1) Setting na trainers
ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS cancel_cutoff_hours integer NOT NULL DEFAULT 0
  CHECK (cancel_cutoff_hours >= 0 AND cancel_cutoff_hours <= 168);

-- 2) RPC: vežbač otkazuje sopstvenu rezervaciju
CREATE OR REPLACE FUNCTION public.cancel_session_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_b       public.session_bookings%ROWTYPE;
  v_cutoff  integer;
  v_slot_at timestamptz;
  v_now     timestamptz := now();
  v_remaining_hours numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_b
    FROM public.session_bookings
   WHERE id = p_booking_id
     AND athlete_id = v_uid
     AND status = 'booked';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rezervacija ne postoji ili je već otkazana';
  END IF;

  SELECT COALESCE(cancel_cutoff_hours, 0)
    INTO v_cutoff
    FROM public.trainers
   WHERE id = v_b.trainer_id;

  v_slot_at := (v_b.date::timestamp + v_b.start_time)::timestamptz;
  v_remaining_hours := EXTRACT(EPOCH FROM (v_slot_at - v_now)) / 3600.0;

  IF v_remaining_hours < v_cutoff THEN
    RAISE EXCEPTION 'Otkazivanje je dozvoljeno najkasnije % h pre termina', v_cutoff;
  END IF;

  UPDATE public.session_bookings
     SET status = 'cancelled'
   WHERE id = p_booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_session_booking(uuid) TO authenticated;
