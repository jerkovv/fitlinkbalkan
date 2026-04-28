-- ============================================================
-- 12_membership_packages.sql
-- Trener pravi pakete članarina (npr. 12 treninga / 28 dana / 12000 RSD)
-- Vežbač bira paket → kreira purchase (pending) → trener potvrdi → 
-- kreira se aktivna članarina sa brojem treninga.
-- Booking inkrementira sessions_used; otkaz pre starta vraća.
-- ============================================================

-- ---------- 1) Paketi ----------
CREATE TABLE IF NOT EXISTS public.membership_packages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  sessions_count  smallint NOT NULL CHECK (sessions_count BETWEEN 1 AND 200),
  duration_days   smallint NOT NULL CHECK (duration_days BETWEEN 1 AND 365),
  price_rsd       integer  NOT NULL CHECK (price_rsd >= 0),
  is_active       boolean  NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_packages_trainer ON public.membership_packages(trainer_id, is_active);

ALTER TABLE public.membership_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trainer manages own packages" ON public.membership_packages;
CREATE POLICY "trainer manages own packages"
  ON public.membership_packages FOR ALL
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid());

DROP POLICY IF EXISTS "athlete reads trainer packages" ON public.membership_packages;
CREATE POLICY "athlete reads trainer packages"
  ON public.membership_packages FOR SELECT
  USING (
    is_active AND EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.id = auth.uid() AND a.trainer_id = membership_packages.trainer_id
    )
  );

-- ---------- 2) Kupovine (zahtev → potvrda) ----------
CREATE TABLE IF NOT EXISTS public.membership_purchases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trainer_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id        uuid REFERENCES public.membership_packages(id) ON DELETE SET NULL,
  -- snapshot u trenutku kupovine
  package_name      text NOT NULL,
  sessions_count    smallint NOT NULL,
  duration_days     smallint NOT NULL,
  price_rsd         integer  NOT NULL,
  payment_method    text NOT NULL CHECK (payment_method IN ('cash','bank')),
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','rejected','cancelled')),
  requested_at      timestamptz NOT NULL DEFAULT now(),
  decided_at        timestamptz,
  notes             text
);

CREATE INDEX IF NOT EXISTS idx_purchases_athlete  ON public.membership_purchases(athlete_id, status);
CREATE INDEX IF NOT EXISTS idx_purchases_trainer  ON public.membership_purchases(trainer_id, status);

ALTER TABLE public.membership_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "athlete reads own purchases" ON public.membership_purchases;
CREATE POLICY "athlete reads own purchases"
  ON public.membership_purchases FOR SELECT
  USING (athlete_id = auth.uid());

DROP POLICY IF EXISTS "trainer reads own purchases" ON public.membership_purchases;
CREATE POLICY "trainer reads own purchases"
  ON public.membership_purchases FOR SELECT
  USING (trainer_id = auth.uid());

-- (Insert/update ide kroz RPC, ne treba direct policy)

-- ---------- 3) Proširi memberships ----------
ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS sessions_total smallint,
  ADD COLUMN IF NOT EXISTS sessions_used  smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_id    uuid REFERENCES public.membership_purchases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS starts_on      date;

-- ---------- 4) RPC: vežbač traži paket ----------
CREATE OR REPLACE FUNCTION public.request_membership_purchase(
  p_package_id uuid,
  p_payment_method text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_athlete uuid := auth.uid();
  v_pkg     membership_packages%ROWTYPE;
  v_trainer uuid;
  v_id      uuid;
BEGIN
  IF v_athlete IS NULL THEN
    RAISE EXCEPTION 'Niste prijavljeni';
  END IF;
  IF p_payment_method NOT IN ('cash','bank') THEN
    RAISE EXCEPTION 'Nepoznat način plaćanja';
  END IF;

  SELECT * INTO v_pkg FROM membership_packages WHERE id = p_package_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paket ne postoji ili nije aktivan';
  END IF;

  SELECT trainer_id INTO v_trainer FROM athletes WHERE id = v_athlete;
  IF v_trainer IS NULL OR v_trainer <> v_pkg.trainer_id THEN
    RAISE EXCEPTION 'Niste član ovog trenera';
  END IF;

  -- Spreči duplikate pending zahteva za isti paket
  IF EXISTS (
    SELECT 1 FROM membership_purchases
    WHERE athlete_id = v_athlete AND package_id = p_package_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Već imaš zahtev na čekanju za ovaj paket';
  END IF;

  INSERT INTO membership_purchases (
    athlete_id, trainer_id, package_id,
    package_name, sessions_count, duration_days, price_rsd,
    payment_method, status
  ) VALUES (
    v_athlete, v_trainer, v_pkg.id,
    v_pkg.name, v_pkg.sessions_count, v_pkg.duration_days, v_pkg.price_rsd,
    p_payment_method, 'pending'
  ) RETURNING id INTO v_id;

  -- Notifikacija treneru (best-effort)
  BEGIN
    INSERT INTO notifications (user_id, kind, title, body, recipient_role)
    VALUES (
      v_trainer, 'payment_request',
      'Novi zahtev za članarinu',
      v_pkg.name || ' · ' || v_pkg.price_rsd || ' RSD (' ||
        CASE p_payment_method WHEN 'cash' THEN 'keš' ELSE 'račun' END || ')',
      'trainer'
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_membership_purchase(uuid, text) TO authenticated;

-- ---------- 5) RPC: vežbač otkaže pending ----------
CREATE OR REPLACE FUNCTION public.cancel_membership_purchase(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE membership_purchases
     SET status = 'cancelled', decided_at = now()
   WHERE id = p_purchase_id
     AND athlete_id = auth.uid()
     AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ne možeš otkazati ovaj zahtev';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_membership_purchase(uuid) TO authenticated;

-- ---------- 6) RPC: trener potvrdi uplatu ----------
CREATE OR REPLACE FUNCTION public.confirm_membership_purchase(
  p_purchase_id uuid,
  p_starts_on   date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trainer uuid := auth.uid();
  v_pur     membership_purchases%ROWTYPE;
  v_mid     uuid;
BEGIN
  SELECT * INTO v_pur FROM membership_purchases
   WHERE id = p_purchase_id AND trainer_id = v_trainer AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Zahtev ne postoji ili nije na čekanju';
  END IF;

  -- Deaktiviraj prethodne aktivne članarine za tog vežbača
  UPDATE memberships
     SET status = 'expired'
   WHERE athlete_id = v_pur.athlete_id
     AND trainer_id = v_trainer
     AND status = 'active';

  INSERT INTO memberships (
    athlete_id, trainer_id, plan_name, status,
    starts_on, ends_on, sessions_total, sessions_used, purchase_id
  ) VALUES (
    v_pur.athlete_id, v_trainer, v_pur.package_name, 'active',
    p_starts_on, p_starts_on + v_pur.duration_days, v_pur.sessions_count, 0, v_pur.id
  ) RETURNING id INTO v_mid;

  UPDATE membership_purchases
     SET status = 'confirmed', decided_at = now()
   WHERE id = p_purchase_id;

  -- Notifikacija vežbaču
  BEGIN
    INSERT INTO notifications (user_id, kind, title, body, recipient_role)
    VALUES (
      v_pur.athlete_id, 'membership_activated',
      'Članarina aktivirana',
      v_pur.package_name || ' · ' || v_pur.sessions_count || ' treninga do ' ||
        to_char(p_starts_on + v_pur.duration_days, 'DD.MM.YYYY'),
      'athlete'
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_mid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_membership_purchase(uuid, date) TO authenticated;

-- ---------- 7) RPC: trener odbije ----------
CREATE OR REPLACE FUNCTION public.reject_membership_purchase(
  p_purchase_id uuid,
  p_notes       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pur membership_purchases%ROWTYPE;
BEGIN
  SELECT * INTO v_pur FROM membership_purchases
   WHERE id = p_purchase_id AND trainer_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Zahtev ne postoji ili nije na čekanju';
  END IF;

  UPDATE membership_purchases
     SET status = 'rejected', decided_at = now(), notes = p_notes
   WHERE id = p_purchase_id;

  BEGIN
    INSERT INTO notifications (user_id, kind, title, body, recipient_role)
    VALUES (
      v_pur.athlete_id, 'membership_rejected',
      'Zahtev za članarinu odbijen',
      v_pur.package_name || COALESCE(' · ' || p_notes, ''),
      'athlete'
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_membership_purchase(uuid, text) TO authenticated;

-- ---------- 8) RPC: trener doda bonus treninge ----------
CREATE OR REPLACE FUNCTION public.add_bonus_sessions(
  p_membership_id uuid,
  p_count         smallint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_count <= 0 OR p_count > 100 THEN
    RAISE EXCEPTION 'Broj treninga mora biti između 1 i 100';
  END IF;

  UPDATE memberships
     SET sessions_total = COALESCE(sessions_total, 0) + p_count
   WHERE id = p_membership_id
     AND trainer_id = auth.uid()
     AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aktivna članarina nije pronađena';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_bonus_sessions(uuid, smallint) TO authenticated;

-- ---------- 9) Update book_session: troši session i blokira ako nema ----------
CREATE OR REPLACE FUNCTION public.book_session(
  p_trainer_id uuid,
  p_date date,
  p_start_time time,
  p_session_type_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_athlete_id uuid := auth.uid();
  v_type       session_types%ROWTYPE;
  v_booked     int;
  v_mem        memberships%ROWTYPE;
  v_booking_id uuid;
BEGIN
  IF v_athlete_id IS NULL THEN
    RAISE EXCEPTION 'Niste prijavljeni';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM athletes WHERE id = v_athlete_id AND trainer_id = p_trainer_id
  ) THEN
    RAISE EXCEPTION 'Niste član ovog trenera';
  END IF;

  -- Nađi aktivnu članarinu (najsvežiju)
  SELECT * INTO v_mem
    FROM memberships
   WHERE athlete_id = v_athlete_id
     AND trainer_id = p_trainer_id
     AND status = 'active'
     AND (ends_on IS NULL OR ends_on >= p_date)
   ORDER BY ends_on DESC NULLS LAST
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nemate aktivnu članarinu';
  END IF;

  IF v_mem.sessions_total IS NOT NULL
     AND v_mem.sessions_used >= v_mem.sessions_total THEN
    RAISE EXCEPTION 'Iskoristili ste sve treninge u članarini';
  END IF;

  SELECT * INTO v_type FROM session_types WHERE id = p_session_type_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tip sesije ne postoji';
  END IF;

  SELECT COUNT(*) INTO v_booked
    FROM session_bookings
   WHERE trainer_id = p_trainer_id
     AND date = p_date
     AND start_time = p_start_time
     AND session_type_id = p_session_type_id
     AND status = 'booked';

  IF v_booked >= v_type.capacity THEN
    RAISE EXCEPTION 'Termin je pun';
  END IF;

  INSERT INTO session_bookings (
    trainer_id, athlete_id, date, start_time, session_type_id,
    type_name, type_color, duration_min, capacity, status
  ) VALUES (
    p_trainer_id, v_athlete_id, p_date, p_start_time, p_session_type_id,
    v_type.name, v_type.color, v_type.duration_min, v_type.capacity, 'booked'
  ) RETURNING id INTO v_booking_id;

  -- Inkrementuj sessions_used
  IF v_mem.sessions_total IS NOT NULL THEN
    UPDATE memberships SET sessions_used = sessions_used + 1 WHERE id = v_mem.id;
  END IF;

  RETURN v_booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_session(uuid, date, time, uuid) TO authenticated;

-- ---------- 10) RPC: otkaz bookinga (vraća session ako pre starta) ----------
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking session_bookings%ROWTYPE;
  v_starts  timestamptz;
BEGIN
  SELECT * INTO v_booking FROM session_bookings
   WHERE id = p_booking_id
     AND athlete_id = auth.uid()
     AND status = 'booked';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Termin ne postoji ili je već otkazan';
  END IF;

  v_starts := (v_booking.date::timestamp + v_booking.start_time)::timestamptz;
  IF v_starts <= now() THEN
    RAISE EXCEPTION 'Ne možeš otkazati termin koji je već počeo';
  END IF;

  UPDATE session_bookings SET status = 'cancelled' WHERE id = p_booking_id;

  -- Vrati 1 trening na aktivnu članarinu (najsvežiju)
  UPDATE memberships
     SET sessions_used = GREATEST(0, sessions_used - 1)
   WHERE id = (
     SELECT id FROM memberships
      WHERE athlete_id = v_booking.athlete_id
        AND trainer_id = v_booking.trainer_id
        AND status = 'active'
        AND sessions_total IS NOT NULL
      ORDER BY ends_on DESC NULLS LAST
      LIMIT 1
   );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated;

-- ---------- 11) Limit: 20 aktivnih paketa po treneru ----------
CREATE OR REPLACE FUNCTION public.enforce_package_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
BEGIN
  IF NEW.is_active THEN
    SELECT COUNT(*) INTO v_count
      FROM membership_packages
     WHERE trainer_id = NEW.trainer_id
       AND is_active
       AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    IF v_count >= 20 THEN
      RAISE EXCEPTION 'Maksimalno 20 aktivnih paketa po treneru';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_package_limit ON public.membership_packages;
CREATE TRIGGER trg_package_limit
  BEFORE INSERT OR UPDATE ON public.membership_packages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_package_limit();
