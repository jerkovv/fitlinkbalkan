-- ============================================================
-- 14_booking_notifications_fix.sql
-- Popravlja notifikacije za zakazivanje i otkazivanje treninga.
--
-- Razlozi:
--  1) Postojeće trigger funkcije koriste NEW.slot_date / OLD.slot_date,
--     ali kolona u session_bookings se zove "date". Time INSERT/DELETE
--     ne uspeva i trener nikad ne dobije notifikaciju (silently fails).
--  2) Otkazivanje se sada radi UPDATE statusa = 'cancelled' (vidi
--     12_membership_packages.sql), ne DELETE-om. Treba UPDATE trigger.
--
-- Idempotentno — može se pokrenuti više puta.
-- ============================================================

-- ============================================================
-- 1) BOOKING CREATED — koristi NEW.date umesto NEW.slot_date
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_booking_created()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_trainer_id   uuid;
  v_athlete_name text;
  v_session_name text;
  v_session_color text;
BEGIN
  -- Snapshot polja su već u NEW (type_name, type_color), ali za sigurnost
  -- pokušamo iz session_types ako postoji:
  SELECT st.trainer_id, st.name, st.color
    INTO v_trainer_id, v_session_name, v_session_color
    FROM public.session_types st
   WHERE st.id = NEW.session_type_id;

  IF v_trainer_id IS NULL THEN
    v_trainer_id := NEW.trainer_id;
  END IF;
  v_session_name  := COALESCE(v_session_name, NEW.type_name, 'Trening');
  v_session_color := COALESCE(v_session_color, NEW.type_color, 'violet');

  SELECT COALESCE(p.full_name, 'Vežbač') INTO v_athlete_name
    FROM public.profiles p
   WHERE p.id = NEW.athlete_id;

  INSERT INTO public.notifications
    (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
  VALUES (
    v_trainer_id, 'trainer', NEW.athlete_id, NEW.athlete_id, 'booking_created',
    v_athlete_name || ' rezervisao termin',
    v_session_name || ' • ' || to_char(NEW.date, 'DD.MM.') || ' u ' || to_char(NEW.start_time, 'HH24:MI'),
    jsonb_build_object(
      'slot_date',     NEW.date,
      'start_time',    NEW.start_time,
      'session_name',  v_session_name,
      'session_color', v_session_color,
      'booking_id',    NEW.id
    )
  );
  RETURN NEW;
END;
$$;

-- INSERT trigger samo za "booked" status (preskoči ako neko ubaci već cancelled)
DROP TRIGGER IF EXISTS trg_notify_booking_created ON public.session_bookings;
CREATE TRIGGER trg_notify_booking_created
  AFTER INSERT ON public.session_bookings
  FOR EACH ROW
  WHEN (NEW.status = 'booked')
  EXECUTE FUNCTION public.notify_booking_created();

-- ============================================================
-- 2) BOOKING CANCELED — radi i na DELETE i na UPDATE→cancelled
-- ============================================================

-- 2a) DELETE varijanta (u slučaju da neko obriše red)
CREATE OR REPLACE FUNCTION public.notify_booking_canceled()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_trainer_id   uuid;
  v_athlete_name text;
  v_session_name text;
  v_session_color text;
BEGIN
  SELECT st.trainer_id, st.name, st.color
    INTO v_trainer_id, v_session_name, v_session_color
    FROM public.session_types st
   WHERE st.id = OLD.session_type_id;

  IF v_trainer_id IS NULL THEN
    v_trainer_id := OLD.trainer_id;
  END IF;
  v_session_name  := COALESCE(v_session_name, OLD.type_name, 'Trening');
  v_session_color := COALESCE(v_session_color, OLD.type_color, 'violet');

  SELECT COALESCE(p.full_name, 'Vežbač') INTO v_athlete_name
    FROM public.profiles p
   WHERE p.id = OLD.athlete_id;

  INSERT INTO public.notifications
    (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
  VALUES (
    v_trainer_id, 'trainer', OLD.athlete_id, OLD.athlete_id, 'booking_canceled',
    v_athlete_name || ' otkazao termin',
    v_session_name || ' • ' || to_char(OLD.date, 'DD.MM.') || ' u ' || to_char(OLD.start_time, 'HH24:MI'),
    jsonb_build_object(
      'slot_date',     OLD.date,
      'start_time',    OLD.start_time,
      'session_name',  v_session_name,
      'session_color', v_session_color
    )
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_canceled ON public.session_bookings;
CREATE TRIGGER trg_notify_booking_canceled
  AFTER DELETE ON public.session_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_booking_canceled();

-- 2b) UPDATE varijanta — okida kad status pređe u 'cancelled'
CREATE OR REPLACE FUNCTION public.notify_booking_status_canceled()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_trainer_id   uuid;
  v_athlete_name text;
  v_session_name text;
  v_session_color text;
BEGIN
  -- Reaguj samo na prelazak u 'cancelled' (ili 'canceled' za stari pravopis)
  IF NEW.status NOT IN ('cancelled','canceled') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT st.trainer_id, st.name, st.color
    INTO v_trainer_id, v_session_name, v_session_color
    FROM public.session_types st
   WHERE st.id = NEW.session_type_id;

  IF v_trainer_id IS NULL THEN
    v_trainer_id := NEW.trainer_id;
  END IF;
  v_session_name  := COALESCE(v_session_name, NEW.type_name, 'Trening');
  v_session_color := COALESCE(v_session_color, NEW.type_color, 'violet');

  SELECT COALESCE(p.full_name, 'Vežbač') INTO v_athlete_name
    FROM public.profiles p
   WHERE p.id = NEW.athlete_id;

  INSERT INTO public.notifications
    (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
  VALUES (
    v_trainer_id, 'trainer', NEW.athlete_id, NEW.athlete_id, 'booking_canceled',
    v_athlete_name || ' otkazao termin',
    v_session_name || ' • ' || to_char(NEW.date, 'DD.MM.') || ' u ' || to_char(NEW.start_time, 'HH24:MI'),
    jsonb_build_object(
      'slot_date',     NEW.date,
      'start_time',    NEW.start_time,
      'session_name',  v_session_name,
      'session_color', v_session_color,
      'booking_id',    NEW.id
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_status_canceled ON public.session_bookings;
CREATE TRIGGER trg_notify_booking_status_canceled
  AFTER UPDATE OF status ON public.session_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_booking_status_canceled();

-- ============================================================
-- 3) Dozvoli kind 'booking_created' i 'booking_canceled' (već postoji u 08)
--    Bez izmena — ovaj fajl samo popravlja trigger funkcije.
-- ============================================================
