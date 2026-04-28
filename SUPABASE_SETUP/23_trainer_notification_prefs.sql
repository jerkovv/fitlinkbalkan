-- ============================================================
-- 23_trainer_notification_prefs.sql
-- Trener može da uključi/isključi grupe obaveštenja:
--   bookings  → booking_created, booking_canceled
--   payments  → payment_marked, membership_* (ka treneru)
--   workouts  → workout_completed
--   messages  → message (od vežbača)
-- Default = sve uključeno.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.trainer_notification_prefs (
  trainer_id  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bookings    boolean NOT NULL DEFAULT true,
  payments    boolean NOT NULL DEFAULT true,
  workouts    boolean NOT NULL DEFAULT true,
  messages    boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trainer_notification_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trainer reads own prefs" ON public.trainer_notification_prefs;
CREATE POLICY "trainer reads own prefs"
  ON public.trainer_notification_prefs FOR SELECT
  USING (trainer_id = auth.uid());

DROP POLICY IF EXISTS "trainer upserts own prefs" ON public.trainer_notification_prefs;
CREATE POLICY "trainer upserts own prefs"
  ON public.trainer_notification_prefs FOR INSERT
  WITH CHECK (trainer_id = auth.uid());

DROP POLICY IF EXISTS "trainer updates own prefs" ON public.trainer_notification_prefs;
CREATE POLICY "trainer updates own prefs"
  ON public.trainer_notification_prefs FOR UPDATE
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid());

-- Helper: vraća TRUE ako trener prima notifikaciju datog tipa.
-- p_kind = 'bookings' | 'payments' | 'workouts' | 'messages'
CREATE OR REPLACE FUNCTION public.should_notify_trainer(p_trainer_id uuid, p_group text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.trainer_notification_prefs%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.trainer_notification_prefs WHERE trainer_id = p_trainer_id;
  IF NOT FOUND THEN
    RETURN true; -- default: sve uključeno
  END IF;
  RETURN CASE p_group
    WHEN 'bookings' THEN v_row.bookings
    WHEN 'payments' THEN v_row.payments
    WHEN 'workouts' THEN v_row.workouts
    WHEN 'messages' THEN v_row.messages
    ELSE true
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.should_notify_trainer(uuid, text) TO authenticated;

-- ============================================================
-- Ažuriraj postojeće trigere/RPC da poštuju preference.
-- ============================================================

-- booking_created
CREATE OR REPLACE FUNCTION public.notify_booking_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_trainer_id uuid; v_athlete_name text; v_session_name text; v_session_color text;
BEGIN
  SELECT st.trainer_id, st.name, st.color INTO v_trainer_id, v_session_name, v_session_color
  FROM public.session_types st WHERE st.id = NEW.session_type_id;

  IF NOT public.should_notify_trainer(v_trainer_id, 'bookings') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.full_name, 'Vežbač') INTO v_athlete_name
  FROM public.profiles p WHERE p.id = NEW.athlete_id;

  INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
  VALUES (v_trainer_id, 'trainer', NEW.athlete_id, NEW.athlete_id, 'booking_created',
    v_athlete_name || ' rezervisao termin',
    v_session_name || ' • ' || to_char(NEW.slot_date, 'DD.MM.') || ' u ' || to_char(NEW.start_time, 'HH24:MI'),
    jsonb_build_object('slot_date', NEW.slot_date, 'start_time', NEW.start_time,
      'session_name', v_session_name, 'session_color', v_session_color, 'booking_id', NEW.id));
  RETURN NEW;
END;
$$;

-- booking_canceled
CREATE OR REPLACE FUNCTION public.notify_booking_canceled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_trainer_id uuid; v_athlete_name text; v_session_name text; v_session_color text;
BEGIN
  SELECT st.trainer_id, st.name, st.color INTO v_trainer_id, v_session_name, v_session_color
  FROM public.session_types st WHERE st.id = OLD.session_type_id;

  IF auth.uid() IS DISTINCT FROM OLD.athlete_id THEN RETURN OLD; END IF;
  IF NOT public.should_notify_trainer(v_trainer_id, 'bookings') THEN RETURN OLD; END IF;

  SELECT COALESCE(p.full_name, 'Vežbač') INTO v_athlete_name
  FROM public.profiles p WHERE p.id = OLD.athlete_id;

  INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
  VALUES (v_trainer_id, 'trainer', OLD.athlete_id, OLD.athlete_id, 'booking_canceled',
    v_athlete_name || ' otkazao termin',
    v_session_name || ' • ' || to_char(OLD.slot_date, 'DD.MM.') || ' u ' || to_char(OLD.start_time, 'HH24:MI'),
    jsonb_build_object('slot_date', OLD.slot_date, 'start_time', OLD.start_time,
      'session_name', v_session_name, 'session_color', v_session_color));
  RETURN OLD;
END;
$$;

-- workout_completed
CREATE OR REPLACE FUNCTION public.notify_workout_completed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_trainer_id uuid; v_athlete_name text; v_program_name text;
BEGIN
  IF NEW.completed_at IS NULL OR (OLD.completed_at IS NOT NULL) THEN RETURN NEW; END IF;

  SELECT a.trainer_id, COALESCE(p.full_name, 'Vežbač'), ap.name
    INTO v_trainer_id, v_athlete_name, v_program_name
  FROM public.assigned_programs ap
  JOIN public.athletes a ON a.id = ap.athlete_id
  JOIN public.profiles p ON p.id = ap.athlete_id
  WHERE ap.id = NEW.assigned_program_id;

  IF v_trainer_id IS NULL THEN RETURN NEW; END IF;
  IF NOT public.should_notify_trainer(v_trainer_id, 'workouts') THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
  VALUES (v_trainer_id, 'trainer', NEW.athlete_id, NEW.athlete_id, 'workout_completed',
    v_athlete_name || ' završio trening',
    COALESCE(v_program_name, 'Program') || ' • Dan ' || NEW.day_number,
    jsonb_build_object('program_name', v_program_name, 'day_number', NEW.day_number,
      'completed_at', NEW.completed_at, 'session_log_id', NEW.id,
      'duration_seconds', NEW.duration_seconds));
  RETURN NEW;
END;
$$;

-- send_message_to_trainer (RPC, vežbač → trener)
CREATE OR REPLACE FUNCTION public.send_message_to_trainer(p_body text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_athlete_id uuid := auth.uid();
  v_trainer_id uuid; v_athlete_name text; v_notif_id uuid;
BEGIN
  IF v_athlete_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'Empty message'; END IF;
  IF length(p_body) > 1000 THEN RAISE EXCEPTION 'Message too long (max 1000)'; END IF;

  SELECT a.trainer_id, COALESCE(p.full_name, 'Vežbač') INTO v_trainer_id, v_athlete_name
  FROM public.athletes a JOIN public.profiles p ON p.id = a.id
  WHERE a.id = v_athlete_id;

  IF v_trainer_id IS NULL THEN RAISE EXCEPTION 'No trainer assigned'; END IF;

  -- Ako je trener isključio messages, vraćamo NULL (vežbač i dalje vidi "poslato")
  IF NOT public.should_notify_trainer(v_trainer_id, 'messages') THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
  VALUES (v_trainer_id, 'trainer', v_athlete_id, v_athlete_id, 'message',
    v_athlete_name || ' poslao poruku', trim(p_body), '{}'::jsonb)
  RETURNING id INTO v_notif_id;
  RETURN v_notif_id;
END;
$$;

-- mark_membership_paid (RPC) — poštuj 'payments' grupu.
-- Tabelu/strukturu zadržavamo identičnu, samo dodajemo gate.
CREATE OR REPLACE FUNCTION public.mark_membership_paid(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pur public.membership_purchases%ROWTYPE;
  v_athlete_name text;
BEGIN
  SELECT * INTO v_pur
    FROM public.membership_purchases
   WHERE id = p_purchase_id AND athlete_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Zahtev ne postoji ili više nije na čekanju'; END IF;
  IF v_pur.payment_marked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Već si označio ovaj zahtev kao plaćen';
  END IF;

  UPDATE public.membership_purchases SET payment_marked_at = now() WHERE id = p_purchase_id;

  IF NOT public.should_notify_trainer(v_pur.trainer_id, 'payments') THEN
    RETURN;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(full_name), ''), 'Vežbač') INTO v_athlete_name
    FROM public.profiles WHERE id = v_pur.athlete_id;

  BEGIN
    INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
    VALUES (
      v_pur.trainer_id, 'trainer', v_pur.athlete_id, v_pur.athlete_id, 'payment_marked',
      'Vežbač potvrdio uplatu',
      COALESCE(v_athlete_name, 'Vežbač') || ' je označio uplatu za "' ||
        v_pur.package_name || '" (' || v_pur.price_rsd || ' RSD). Potvrdi prijem.',
      '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_membership_paid(uuid) TO authenticated;
