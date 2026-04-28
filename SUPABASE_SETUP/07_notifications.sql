-- ============================================================
-- 07_notifications.sql
-- Notifikacije koje vežbač šalje treneru
-- Tipovi: booking_created, booking_canceled, workout_completed, message
-- ============================================================

-- 1) Tabela
CREATE TABLE IF NOT EXISTS public.notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('booking_created','booking_canceled','workout_completed','message')),
  title         text NOT NULL,
  body          text,
  -- meta sadrži kontekst za navigaciju (slot_date, slot_time, session_type, day_number...)
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_trainer_unread
  ON public.notifications(trainer_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_trainer_recent
  ON public.notifications(trainer_id, created_at DESC);

-- 2) RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trainer reads own notifications" ON public.notifications;
CREATE POLICY "trainer reads own notifications"
  ON public.notifications FOR SELECT
  USING (trainer_id = auth.uid());

DROP POLICY IF EXISTS "trainer updates own notifications" ON public.notifications;
CREATE POLICY "trainer updates own notifications"
  ON public.notifications FOR UPDATE
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid());

DROP POLICY IF EXISTS "trainer deletes own notifications" ON public.notifications;
CREATE POLICY "trainer deletes own notifications"
  ON public.notifications FOR DELETE
  USING (trainer_id = auth.uid());

-- INSERT ide preko trigger-a (SECURITY DEFINER) i RPC-a, ne direktno sa klijenta.
-- Ali za message RPC-u dozvoljavamo insert kroz security definer funkciju.

-- 3) Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- ============================================================
-- 4) Trigeri — automatske notifikacije
-- ============================================================

-- 4a) Booking created
CREATE OR REPLACE FUNCTION public.notify_booking_created()
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
  SELECT st.trainer_id, st.name, st.color
    INTO v_trainer_id, v_session_name, v_session_color
  FROM public.session_types st
  WHERE st.id = NEW.session_type_id;

  SELECT COALESCE(p.full_name, 'Vežbač')
    INTO v_athlete_name
  FROM public.profiles p
  WHERE p.id = NEW.athlete_id;

  INSERT INTO public.notifications (trainer_id, athlete_id, kind, title, body, meta)
  VALUES (
    v_trainer_id,
    NEW.athlete_id,
    'booking_created',
    v_athlete_name || ' rezervisao termin',
    v_session_name || ' • ' || to_char(NEW.slot_date, 'DD.MM.') || ' u ' || to_char(NEW.start_time, 'HH24:MI'),
    jsonb_build_object(
      'slot_date',    NEW.slot_date,
      'start_time',   NEW.start_time,
      'session_name', v_session_name,
      'session_color', v_session_color,
      'booking_id',   NEW.id
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_created ON public.session_bookings;
CREATE TRIGGER trg_notify_booking_created
  AFTER INSERT ON public.session_bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_booking_created();

-- 4b) Booking canceled (DELETE ili status='canceled')
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
  SELECT st.trainer_id, st.name, st.color
    INTO v_trainer_id, v_session_name, v_session_color
  FROM public.session_types st
  WHERE st.id = OLD.session_type_id;

  SELECT COALESCE(p.full_name, 'Vežbač')
    INTO v_athlete_name
  FROM public.profiles p
  WHERE p.id = OLD.athlete_id;

  -- Ne pravi notifikaciju ako je trener obrisao (samo kad vežbač sam otkaže)
  IF auth.uid() IS DISTINCT FROM OLD.athlete_id THEN
    RETURN OLD;
  END IF;

  INSERT INTO public.notifications (trainer_id, athlete_id, kind, title, body, meta)
  VALUES (
    v_trainer_id,
    OLD.athlete_id,
    'booking_canceled',
    v_athlete_name || ' otkazao termin',
    v_session_name || ' • ' || to_char(OLD.slot_date, 'DD.MM.') || ' u ' || to_char(OLD.start_time, 'HH24:MI'),
    jsonb_build_object(
      'slot_date',    OLD.slot_date,
      'start_time',   OLD.start_time,
      'session_name', v_session_name,
      'session_color', v_session_color
    )
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_canceled ON public.session_bookings;
CREATE TRIGGER trg_notify_booking_canceled
  AFTER DELETE ON public.session_bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_booking_canceled();

-- 4c) Workout completed (kada vežbač završi trening: completed_at postavljeno)
CREATE OR REPLACE FUNCTION public.notify_workout_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trainer_id uuid;
  v_athlete_name text;
  v_program_name text;
BEGIN
  IF NEW.completed_at IS NULL OR (OLD.completed_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  SELECT a.trainer_id, COALESCE(p.full_name, 'Vežbač'), ap.name
    INTO v_trainer_id, v_athlete_name, v_program_name
  FROM public.assigned_programs ap
  JOIN public.athletes a   ON a.id = ap.athlete_id
  JOIN public.profiles p   ON p.id = ap.athlete_id
  WHERE ap.id = NEW.assigned_program_id;

  IF v_trainer_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (trainer_id, athlete_id, kind, title, body, meta)
  VALUES (
    v_trainer_id,
    NEW.athlete_id,
    'workout_completed',
    v_athlete_name || ' završio trening',
    COALESCE(v_program_name, 'Program') || ' • Dan ' || NEW.day_number,
    jsonb_build_object(
      'program_name', v_program_name,
      'day_number',   NEW.day_number,
      'completed_at', NEW.completed_at,
      'session_log_id', NEW.id,
      'duration_seconds', NEW.duration_seconds
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_workout_completed ON public.workout_session_logs;
CREATE TRIGGER trg_notify_workout_completed
  AFTER UPDATE ON public.workout_session_logs
  FOR EACH ROW EXECUTE FUNCTION public.notify_workout_completed();

-- ============================================================
-- 5) RPC — vežbač šalje slobodnu poruku treneru
-- ============================================================
CREATE OR REPLACE FUNCTION public.send_message_to_trainer(p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_athlete_id uuid := auth.uid();
  v_trainer_id uuid;
  v_athlete_name text;
  v_notif_id uuid;
BEGIN
  IF v_athlete_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Empty message';
  END IF;

  IF length(p_body) > 1000 THEN
    RAISE EXCEPTION 'Message too long (max 1000)';
  END IF;

  SELECT a.trainer_id, COALESCE(p.full_name, 'Vežbač')
    INTO v_trainer_id, v_athlete_name
  FROM public.athletes a
  JOIN public.profiles p ON p.id = a.id
  WHERE a.id = v_athlete_id;

  IF v_trainer_id IS NULL THEN
    RAISE EXCEPTION 'No trainer assigned';
  END IF;

  INSERT INTO public.notifications (trainer_id, athlete_id, kind, title, body, meta)
  VALUES (
    v_trainer_id,
    v_athlete_id,
    'message',
    v_athlete_name || ' poslao poruku',
    trim(p_body),
    '{}'::jsonb
  )
  RETURNING id INTO v_notif_id;

  RETURN v_notif_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_message_to_trainer(text) TO authenticated;

-- ============================================================
-- 6) RPC — mark all as read
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.notifications
     SET is_read = true
   WHERE trainer_id = auth.uid()
     AND is_read = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
