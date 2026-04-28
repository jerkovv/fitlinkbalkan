-- ============================================================
-- 09_broadcast_notifications.sql
-- Trener šalje notifikaciju svim svojim vežbačima (ili samo aktivnim).
-- ============================================================

-- 1) Proširi CHECK na nov tip 'broadcast'
DO $$
DECLARE v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%kind%'
  LIMIT 1;
  IF v_conname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.notifications DROP CONSTRAINT ' || quote_ident(v_conname);
  END IF;
END $$;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
    'booking_created','booking_canceled','workout_completed','message',
    'program_assigned','nutrition_assigned','message_from_trainer',
    'membership_expiring','membership_expired',
    'broadcast'
  ));

-- 2) RPC — broadcast
CREATE OR REPLACE FUNCTION public.broadcast_to_athletes(
  p_body         text,
  p_only_active  boolean DEFAULT false,
  p_title        text    DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trainer_id   uuid := auth.uid();
  v_trainer_name text;
  v_today        date := (now() AT TIME ZONE 'Europe/Belgrade')::date;
  v_title        text;
  v_count        int  := 0;
BEGIN
  IF v_trainer_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Empty message';
  END IF;
  IF length(p_body) > 1000 THEN
    RAISE EXCEPTION 'Message too long (max 1000)';
  END IF;

  SELECT COALESCE(full_name, 'Trener') INTO v_trainer_name
  FROM public.profiles WHERE id = v_trainer_id;

  v_title := COALESCE(NULLIF(trim(p_title), ''),
                      'Obaveštenje od ' || v_trainer_name);

  WITH targets AS (
    SELECT a.id AS athlete_id
    FROM public.athletes a
    WHERE a.trainer_id = v_trainer_id
      AND (
        NOT p_only_active
        OR EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.athlete_id = a.id
            AND m.status = 'active'
            AND (m.ends_on IS NULL OR m.ends_on >= v_today)
        )
      )
  ),
  ins AS (
    INSERT INTO public.notifications
      (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
    SELECT
      t.athlete_id, 'athlete', v_trainer_id, t.athlete_id,
      'broadcast', v_title, trim(p_body),
      jsonb_build_object('only_active', p_only_active)
    FROM targets t
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.broadcast_to_athletes(text, boolean, text) TO authenticated;
