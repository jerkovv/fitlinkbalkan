-- Trener bira pojedinacna obavestenja, ne samo cetiri grupe. muted_kinds cuva vrste koje
-- NE zeli. Provera je na jednom mestu, pre upisa u notifications, pa vazi za svaku
-- funkciju koja pravi obavestenje (i za buduce), a bez upisa ne ide ni push.
--
-- Stare kolone grupa (bookings, payments, workouts, messages) ostaju zbog verzije
-- aplikacije koja jos pise njih: promena grupe se prevodi u muted_kinds.

ALTER TABLE public.trainer_notification_prefs
  ADD COLUMN IF NOT EXISTS muted_kinds text[] NOT NULL DEFAULT '{}';

-- Vrste po grupi (jedan izvor za prevod grupa i za should_notify_trainer).
CREATE OR REPLACE FUNCTION public._trainer_notif_group_kinds(p_group text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_group
    WHEN 'bookings' THEN ARRAY['booking_created','booking_canceled','waitlist_joined']
    WHEN 'payments' THEN ARRAY['payment_request','payment_marked']
    WHEN 'workouts' THEN ARRAY['workout_completed','pr_set']
    WHEN 'messages' THEN ARRAY['message']
  END;
$function$;

REVOKE EXECUTE ON FUNCTION public._trainer_notif_group_kinds(text) FROM PUBLIC, anon, authenticated;

-- Postojece iskljucene grupe -> sve njihove vrste utisane.
UPDATE public.trainer_notification_prefs p
SET muted_kinds = (
  SELECT coalesce(array_agg(DISTINCT k ORDER BY k), '{}')
  FROM unnest(
    p.muted_kinds
    || CASE WHEN NOT p.bookings THEN public._trainer_notif_group_kinds('bookings') ELSE '{}'::text[] END
    || CASE WHEN NOT p.payments THEN public._trainer_notif_group_kinds('payments') ELSE '{}'::text[] END
    || CASE WHEN NOT p.workouts THEN public._trainer_notif_group_kinds('workouts') ELSE '{}'::text[] END
    || CASE WHEN NOT p.messages THEN public._trainer_notif_group_kinds('messages') ELSE '{}'::text[] END
  ) AS k
);

-- Stara aplikacija menja grupu: iskljucena grupa utisa sve svoje vrste, ukljucena ih
-- vrati. Na INSERT se samo dodaje (nova aplikacija upisuje muted_kinds uz podrazumevane
-- true grupe, pa bi uklanjanje obrisalo ono sto je trener upravo izabrao).
CREATE OR REPLACE FUNCTION public.tg_trainer_notif_prefs_groups()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  g text;
  v_novo boolean;
  v_staro boolean;
  v_vrste text[];
BEGIN
  FOREACH g IN ARRAY ARRAY['bookings','payments','workouts','messages'] LOOP
    v_novo := (to_jsonb(NEW) ->> g)::boolean;
    v_staro := CASE WHEN TG_OP = 'UPDATE' THEN (to_jsonb(OLD) ->> g)::boolean END;
    v_vrste := public._trainer_notif_group_kinds(g);
    IF TG_OP = 'INSERT' THEN
      IF v_novo = false THEN
        NEW.muted_kinds := (SELECT array_agg(DISTINCT k ORDER BY k) FROM unnest(NEW.muted_kinds || v_vrste) k);
      END IF;
    ELSIF v_novo IS DISTINCT FROM v_staro THEN
      IF v_novo = false THEN
        NEW.muted_kinds := (SELECT array_agg(DISTINCT k ORDER BY k) FROM unnest(NEW.muted_kinds || v_vrste) k);
      ELSE
        NEW.muted_kinds := coalesce(
          (SELECT array_agg(k ORDER BY k) FROM unnest(NEW.muted_kinds) k WHERE k <> ALL (v_vrste)),
          '{}'
        );
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_trainer_notif_prefs_groups ON public.trainer_notification_prefs;
CREATE TRIGGER trg_trainer_notif_prefs_groups
  BEFORE INSERT OR UPDATE ON public.trainer_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.tg_trainer_notif_prefs_groups();

-- Grupa je ugasena tek kad je svaka njena vrsta utisana (tad funkcija ni ne pravi
-- obavestenje). Pojedinacnu vrstu zaustavlja tg_notifications_trainer_prefs.
CREATE OR REPLACE FUNCTION public.should_notify_trainer(p_trainer_id uuid, p_group text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_muted text[];
  v_vrste text[];
BEGIN
  SELECT muted_kinds INTO v_muted FROM public.trainer_notification_prefs WHERE trainer_id = p_trainer_id;
  IF NOT FOUND OR v_muted IS NULL THEN
    RETURN true; -- default: sve ukljuceno
  END IF;
  v_vrste := public._trainer_notif_group_kinds(p_group);
  IF v_vrste IS NULL THEN
    RETURN true;
  END IF;
  RETURN NOT (v_vrste <@ v_muted);
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_notifications_trainer_prefs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.recipient_role = 'trainer' AND EXISTS (
    SELECT 1 FROM public.trainer_notification_prefs p
    WHERE p.trainer_id = NEW.recipient_id
      AND NEW.kind = ANY (p.muted_kinds)
  ) THEN
    RETURN NULL; -- trener je ovu vrstu iskljucio: bez upisa, pa i bez push-a
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notifications_trainer_prefs ON public.notifications;
CREATE TRIGGER trg_notifications_trainer_prefs
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.tg_notifications_trainer_prefs();
