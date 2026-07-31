-- Popravka pogresne atribucije otkazivanja termina.
--
-- STARO PONASANJE:
--   notify_booking_canceled (DELETE)         -> obavesti trenera SAMO ako
--     je vezbac sam obrisao (auth.uid()=athlete_id). Ako trener obrise
--     tudju rezervaciju, NISTA se ne desava, ni trener ni vezbac ne
--     saznaju.
--   notify_booking_status_canceled (UPDATE)  -> UVEK obavesti trenera
--     tekstom "<ime> otkazao termin", bez obzira ko je stvarno izvrsio
--     UPDATE. Ako trener otkaze vezbacu termin, trener dobije poruku da
--     je VEZBAC otkazao (pogresna atribucija), a vezbac ne dobija nista.
--
-- NOVO PONASANJE, oba trigera:
--   ako je vezbac sam otkazao -> obavesti trenera (kao i do sada,
--     postovanje should_notify_trainer dodato i na UPDATE granu)
--   ako je NEKO DRUGI (trener) otkazao -> obavesti VEZBACA, nov kind
--     'booking_canceled_by_trainer', jasan tekst da je TRENER otkazao

CREATE OR REPLACE FUNCTION public.notify_booking_canceled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trainer_id uuid;
  v_athlete_name text;
  v_session_name text;
  v_session_color text;
BEGIN
  SELECT st.trainer_id, st.name, st.color INTO v_trainer_id, v_session_name, v_session_color
  FROM public.session_types st WHERE st.id = OLD.session_type_id;

  v_session_name := COALESCE(v_session_name, OLD.type_name, 'Trening');
  v_session_color := COALESCE(v_session_color, OLD.type_color, 'violet');
  IF v_trainer_id IS NULL THEN
    v_trainer_id := OLD.trainer_id;
  END IF;

  IF auth.uid() IS NOT DISTINCT FROM OLD.athlete_id THEN
    -- Vezbac je sam otkazao -> obavesti trenera
    IF NOT public.should_notify_trainer(v_trainer_id, 'bookings') THEN
      RETURN OLD;
    END IF;

    SELECT COALESCE(p.full_name, 'Vežbač') INTO v_athlete_name
    FROM public.profiles p WHERE p.id = OLD.athlete_id;

    INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
    VALUES (v_trainer_id, 'trainer', OLD.athlete_id, OLD.athlete_id, 'booking_canceled',
      v_athlete_name || ' otkazao termin',
      v_session_name || ' • ' || to_char(OLD.date, 'DD.MM.') || ' u ' || to_char(OLD.start_time, 'HH24:MI'),
      jsonb_build_object('slot_date', OLD.date, 'start_time', OLD.start_time,
        'session_name', v_session_name, 'session_color', v_session_color));
  ELSE
    -- Trener (ili neko drugi) je otkazao -> obavesti vezbaca
    INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
    VALUES (OLD.athlete_id, 'athlete', auth.uid(), OLD.athlete_id, 'booking_canceled_by_trainer',
      'Trener je otkazao tvoj termin',
      v_session_name || ' • ' || to_char(OLD.date, 'DD.MM.') || ' u ' || to_char(OLD.start_time, 'HH24:MI'),
      jsonb_build_object('slot_date', OLD.date, 'start_time', OLD.start_time,
        'session_name', v_session_name, 'session_color', v_session_color));
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_booking_status_canceled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trainer_id   uuid;
  v_athlete_name text;
  v_session_name text;
  v_session_color text;
BEGIN
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

  IF auth.uid() IS NOT DISTINCT FROM NEW.athlete_id THEN
    -- Vezbac je sam otkazao -> obavesti trenera
    IF NOT public.should_notify_trainer(v_trainer_id, 'bookings') THEN
      RETURN NEW;
    END IF;

    SELECT COALESCE(p.full_name, 'Vežbač') INTO v_athlete_name
      FROM public.profiles p WHERE p.id = NEW.athlete_id;

    INSERT INTO public.notifications
      (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
    VALUES (
      v_trainer_id, 'trainer', NEW.athlete_id, NEW.athlete_id, 'booking_canceled',
      v_athlete_name || ' otkazao termin',
      v_session_name || ' • ' || to_char(NEW.date, 'DD.MM.') || ' u ' || to_char(NEW.start_time, 'HH24:MI'),
      jsonb_build_object('slot_date', NEW.date, 'start_time', NEW.start_time,
        'session_name', v_session_name, 'session_color', v_session_color, 'booking_id', NEW.id)
    );
  ELSE
    -- Trener (ili neko drugi) je otkazao -> obavesti vezbaca
    INSERT INTO public.notifications
      (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
    VALUES (
      NEW.athlete_id, 'athlete', auth.uid(), NEW.athlete_id, 'booking_canceled_by_trainer',
      'Trener je otkazao tvoj termin',
      v_session_name || ' • ' || to_char(NEW.date, 'DD.MM.') || ' u ' || to_char(NEW.start_time, 'HH24:MI'),
      jsonb_build_object('slot_date', NEW.date, 'start_time', NEW.start_time,
        'session_name', v_session_name, 'session_color', v_session_color, 'booking_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Novo: otkazivanje CELOG termina (session_slot_overrides.is_canceled)
-- danas ne obavestava NIKOGA. Svaki vezbac koji ima aktivnu rezervaciju
-- na tacno taj trainer_id + date + start_time (i session_type_id ako je
-- override vezan za konkretan tip) dobija obavestenje.

CREATE OR REPLACE FUNCTION public.notify_slot_canceled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_name text;
  v_session_color text;
  r record;
BEGIN
  IF NEW.is_canceled IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_canceled IS NOT DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  SELECT st.name, st.color INTO v_session_name, v_session_color
  FROM public.session_types st WHERE st.id = NEW.session_type_id;
  v_session_name := COALESCE(v_session_name, 'Trening');
  v_session_color := COALESCE(v_session_color, 'violet');

  FOR r IN
    SELECT sb.id AS booking_id, sb.athlete_id
    FROM public.session_bookings sb
    WHERE sb.trainer_id = NEW.trainer_id
      AND sb.date = NEW.date
      AND sb.start_time = NEW.start_time
      AND sb.status = 'booked'
      AND (NEW.session_type_id IS NULL OR sb.session_type_id = NEW.session_type_id)
  LOOP
    INSERT INTO public.notifications
      (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
    VALUES (
      r.athlete_id, 'athlete', NEW.trainer_id, r.athlete_id, 'booking_canceled_by_trainer',
      'Trener je otkazao termin',
      v_session_name || ' • ' || to_char(NEW.date, 'DD.MM.') || ' u ' || to_char(NEW.start_time, 'HH24:MI'),
      jsonb_build_object('slot_date', NEW.date, 'start_time', NEW.start_time,
        'session_name', v_session_name, 'session_color', v_session_color, 'booking_id', r.booking_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_slot_canceled ON public.session_slot_overrides;
CREATE TRIGGER trg_notify_slot_canceled
  AFTER INSERT OR UPDATE OF is_canceled ON public.session_slot_overrides
  FOR EACH ROW EXECUTE FUNCTION public.notify_slot_canceled();
