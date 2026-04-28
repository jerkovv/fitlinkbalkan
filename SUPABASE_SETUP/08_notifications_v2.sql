-- ============================================================
-- 08_notifications_v2.sql
-- Proširenje: notifikacije idu i ka vežbaču (ne samo treneru)
--
-- Šta menja:
--  - notifications.trainer_id → notifications.recipient_id (+ recipient_role)
--  - novi tipovi: program_assigned, nutrition_assigned, message_from_trainer,
--                 membership_expiring, membership_expired
--  - RLS: recipient čita/menja/briše svoje
--  - novi trigeri: assigned_programs INSERT/UPDATE, assigned_nutrition_plans INSERT
--  - nove RPC: send_message_to_athlete(p_athlete_id, p_body),
--             check_membership_expirations() (poziva ga pg_cron)
--  - pg_cron job: dnevno u 09:00 Europe/Belgrade
--
-- Idempotentan — može se pokrenuti više puta.
-- ============================================================

-- ============================================================
-- 1) Schema migration
-- ============================================================

-- Preimenuj trainer_id → recipient_id ako još nije
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications' AND column_name='trainer_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications' AND column_name='recipient_id'
  ) THEN
    ALTER TABLE public.notifications RENAME COLUMN trainer_id TO recipient_id;
  END IF;
END $$;

-- Dodaj recipient_role
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS recipient_role text NOT NULL DEFAULT 'trainer'
  CHECK (recipient_role IN ('trainer','athlete'));

-- athlete_id → sender_id semantički (zadržavamo ime athlete_id da ne lomi 07);
-- ali ako šaljemo OD trenera KA vežbaču, athlete_id = primalac. Zato:
-- - kad recipient_role='trainer': athlete_id = vežbač pošiljalac
-- - kad recipient_role='athlete': athlete_id = vežbač primalac (= recipient_id)
-- To je OK za UI, jer za prikaz bitno je samo title/body/meta.
-- Ali bolje je dodati sender_id eksplicitno:
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill sender_id iz athlete_id za stare zapise (bili su uvek od vežbača)
UPDATE public.notifications
   SET sender_id = athlete_id
 WHERE sender_id IS NULL AND athlete_id IS NOT NULL;

-- Proširi CHECK na kind (drop + recreate)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema='public' AND table_name='notifications' AND constraint_name LIKE '%kind%check%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.notifications DROP CONSTRAINT ' || quote_ident(conname)
      FROM pg_constraint
      WHERE conrelid = 'public.notifications'::regclass AND contype='c'
        AND pg_get_constraintdef(oid) LIKE '%kind%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
    -- ka treneru
    'booking_created','booking_canceled','workout_completed','message',
    -- ka vežbaču
    'program_assigned','nutrition_assigned','message_from_trainer',
    'membership_expiring','membership_expired'
  ));

-- Indeksi
DROP INDEX IF EXISTS public.idx_notif_trainer_unread;
DROP INDEX IF EXISTS public.idx_notif_trainer_recent;
CREATE INDEX IF NOT EXISTS idx_notif_recipient_unread
  ON public.notifications(recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_recipient_recent
  ON public.notifications(recipient_id, created_at DESC);

-- ============================================================
-- 2) RLS — zameni stare polise
-- ============================================================
DROP POLICY IF EXISTS "trainer reads own notifications" ON public.notifications;
DROP POLICY IF EXISTS "trainer updates own notifications" ON public.notifications;
DROP POLICY IF EXISTS "trainer deletes own notifications" ON public.notifications;

DROP POLICY IF EXISTS "recipient reads own notifications" ON public.notifications;
CREATE POLICY "recipient reads own notifications"
  ON public.notifications FOR SELECT
  USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "recipient updates own notifications" ON public.notifications;
CREATE POLICY "recipient updates own notifications"
  ON public.notifications FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

DROP POLICY IF EXISTS "recipient deletes own notifications" ON public.notifications;
CREATE POLICY "recipient deletes own notifications"
  ON public.notifications FOR DELETE
  USING (recipient_id = auth.uid());

-- ============================================================
-- 3) Update postojećih trigera (booking + workout) — koriste recipient_id
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_booking_created()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_trainer_id uuid; v_athlete_name text; v_session_name text; v_session_color text;
BEGIN
  SELECT st.trainer_id, st.name, st.color INTO v_trainer_id, v_session_name, v_session_color
  FROM public.session_types st WHERE st.id = NEW.session_type_id;

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

CREATE OR REPLACE FUNCTION public.notify_booking_canceled()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_trainer_id uuid; v_athlete_name text; v_session_name text; v_session_color text;
BEGIN
  SELECT st.trainer_id, st.name, st.color INTO v_trainer_id, v_session_name, v_session_color
  FROM public.session_types st WHERE st.id = OLD.session_type_id;

  SELECT COALESCE(p.full_name, 'Vežbač') INTO v_athlete_name
  FROM public.profiles p WHERE p.id = OLD.athlete_id;

  IF auth.uid() IS DISTINCT FROM OLD.athlete_id THEN RETURN OLD; END IF;

  INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
  VALUES (v_trainer_id, 'trainer', OLD.athlete_id, OLD.athlete_id, 'booking_canceled',
    v_athlete_name || ' otkazao termin',
    v_session_name || ' • ' || to_char(OLD.slot_date, 'DD.MM.') || ' u ' || to_char(OLD.start_time, 'HH24:MI'),
    jsonb_build_object('slot_date', OLD.slot_date, 'start_time', OLD.start_time,
      'session_name', v_session_name, 'session_color', v_session_color));
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_workout_completed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

-- send_message_to_trainer (vežbač → trener)
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

  INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
  VALUES (v_trainer_id, 'trainer', v_athlete_id, v_athlete_id, 'message',
    v_athlete_name || ' poslao poruku', trim(p_body), '{}'::jsonb)
  RETURNING id INTO v_notif_id;
  RETURN v_notif_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.notifications SET is_read = true
   WHERE recipient_id = auth.uid() AND is_read = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- 4) NOVI trigeri ka vežbaču
-- ============================================================

-- 4a) Program dodeljen / izmenjen
CREATE OR REPLACE FUNCTION public.notify_program_assigned()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_trainer_name text; v_kind text; v_title text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.name IS NOT DISTINCT FROM OLD.name THEN
    -- Samo ime se promenilo? preskoči osim ako se nešto bitno menja.
    -- Za sada: notifikacija samo na INSERT (novi program).
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_kind := 'program_assigned';
    v_title := 'Dobio si nov program';
  ELSE
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.full_name, 'Trener') INTO v_trainer_name
  FROM public.athletes a
  JOIN public.profiles p ON p.id = a.trainer_id
  WHERE a.id = NEW.athlete_id;

  INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
  VALUES (NEW.athlete_id, 'athlete', NULL, NEW.athlete_id, v_kind,
    v_title, COALESCE(NEW.name, 'Program treninga') ||
      CASE WHEN v_trainer_name IS NOT NULL THEN ' • od ' || v_trainer_name ELSE '' END,
    jsonb_build_object('assigned_program_id', NEW.id, 'program_name', NEW.name));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_program_assigned ON public.assigned_programs;
CREATE TRIGGER trg_notify_program_assigned
  AFTER INSERT ON public.assigned_programs
  FOR EACH ROW EXECUTE FUNCTION public.notify_program_assigned();

-- 4b) Plan ishrane dodeljen — proveri da li tabela postoji
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='assigned_nutrition_plans'
  ) THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.notify_nutrition_assigned()
      RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
      AS $body$
      DECLARE v_trainer_name text;
      BEGIN
        SELECT COALESCE(p.full_name, 'Trener') INTO v_trainer_name
        FROM public.athletes a JOIN public.profiles p ON p.id = a.trainer_id
        WHERE a.id = NEW.athlete_id;

        INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
        VALUES (NEW.athlete_id, 'athlete', NULL, NEW.athlete_id, 'nutrition_assigned',
          'Dobio si plan ishrane', COALESCE(NEW.name, 'Plan ishrane') ||
            CASE WHEN v_trainer_name IS NOT NULL THEN ' • od ' || v_trainer_name ELSE '' END,
          jsonb_build_object('assigned_plan_id', NEW.id, 'plan_name', NEW.name));
        RETURN NEW;
      END;
      $body$;
    $f$;

    EXECUTE 'DROP TRIGGER IF EXISTS trg_notify_nutrition_assigned ON public.assigned_nutrition_plans';
    EXECUTE 'CREATE TRIGGER trg_notify_nutrition_assigned
      AFTER INSERT ON public.assigned_nutrition_plans
      FOR EACH ROW EXECUTE FUNCTION public.notify_nutrition_assigned()';
  END IF;
END $$;

-- ============================================================
-- 5) RPC — trener šalje poruku vežbaču
-- ============================================================
CREATE OR REPLACE FUNCTION public.send_message_to_athlete(p_athlete_id uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_trainer_id uuid := auth.uid();
  v_trainer_name text; v_notif_id uuid; v_owns boolean;
BEGIN
  IF v_trainer_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'Empty message'; END IF;
  IF length(p_body) > 1000 THEN RAISE EXCEPTION 'Message too long (max 1000)'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.athletes WHERE id = p_athlete_id AND trainer_id = v_trainer_id
  ) INTO v_owns;
  IF NOT v_owns THEN RAISE EXCEPTION 'Not your athlete'; END IF;

  SELECT COALESCE(full_name, 'Trener') INTO v_trainer_name
  FROM public.profiles WHERE id = v_trainer_id;

  INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
  VALUES (p_athlete_id, 'athlete', v_trainer_id, p_athlete_id, 'message_from_trainer',
    v_trainer_name || ' ti poslao poruku', trim(p_body), '{}'::jsonb)
  RETURNING id INTO v_notif_id;
  RETURN v_notif_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.send_message_to_athlete(uuid, text) TO authenticated;

-- ============================================================
-- 6) Cron — provera isteka članarine
--   Šalje na 7, 3, 1 dan pre + na dan isteka (membership_expired).
--   Anti-duplikat: za isti membership_id i isti milestone (days_left) ne pravimo
--   drugu notifikaciju u istom danu.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_membership_expirations()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  r record;
  v_today date := (now() AT TIME ZONE 'Europe/Belgrade')::date;
  v_days_left int;
  v_kind text;
  v_title text;
  v_body text;
  v_dedup_key text;
BEGIN
  FOR r IN
    SELECT m.id, m.athlete_id, m.ends_on
    FROM public.memberships m
    WHERE m.status = 'active'
      AND m.ends_on IS NOT NULL
      AND m.ends_on >= v_today - INTERVAL '0 day'
      AND m.ends_on <= v_today + INTERVAL '7 day'
  LOOP
    v_days_left := (r.ends_on - v_today);

    IF v_days_left NOT IN (0, 1, 3, 7) THEN
      CONTINUE;
    END IF;

    IF v_days_left = 0 THEN
      v_kind := 'membership_expired';
      v_title := 'Članarina ti je istekla danas';
      v_body := 'Obnovi članarinu da nastaviš sa rezervacijama.';
    ELSE
      v_kind := 'membership_expiring';
      v_title := CASE
        WHEN v_days_left = 1 THEN 'Članarina ti ističe sutra'
        ELSE 'Članarina ti ističe za ' || v_days_left || ' dana'
      END;
      v_body := 'Ističe ' || to_char(r.ends_on, 'DD.MM.YYYY.') || '. Kontaktiraj trenera za produženje.';
    END IF;

    v_dedup_key := r.id::text || ':' || v_days_left::text;

    -- Anti-duplikat: ako već postoji notifikacija za ovaj membership+days_left, preskoči
    IF EXISTS (
      SELECT 1 FROM public.notifications
      WHERE recipient_id = r.athlete_id
        AND kind IN ('membership_expiring','membership_expired')
        AND meta->>'dedup_key' = v_dedup_key
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
    VALUES (r.athlete_id, 'athlete', NULL, r.athlete_id, v_kind, v_title, v_body,
      jsonb_build_object('membership_id', r.id, 'ends_on', r.ends_on,
        'days_left', v_days_left, 'dedup_key', v_dedup_key));
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- pg_cron registracija — bezbedno čak i ako ekstenzija nije omogućena
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- otkaži postojeći job ako postoji
    PERFORM cron.unschedule(jobid)
      FROM cron.job WHERE jobname = 'check_membership_expirations_daily';

    PERFORM cron.schedule(
      'check_membership_expirations_daily',
      '0 8 * * *', -- 08:00 UTC = 09:00 ili 10:00 Beograd (zavisi od DST)
      $cron$ SELECT public.check_membership_expirations(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron extension not enabled — skipping cron job. Enable u Supabase Dashboard → Database → Extensions, pa ponovo pokreni ovaj fajl.';
  END IF;
END $$;
