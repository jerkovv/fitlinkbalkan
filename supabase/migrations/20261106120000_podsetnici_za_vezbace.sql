-- 1) Popravka podsetnika treneru (20261105200000): upis je padao jer notifications.athlete_id
--    ne sme biti NULL (obavestenja samo za trenera nose njegov id, kao fitlink_sub_*), a nove
--    vrste nisu bile u notifications_kind_check. Proba (p_proba) to nije videla jer ne upisuje.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind = ANY (ARRAY[
  'booking_created', 'booking_canceled', 'booking_canceled_by_trainer', 'booking_added_by_trainer',
  'workout_completed', 'message', 'program_assigned', 'nutrition_assigned', 'message_from_trainer',
  'membership_expiring', 'membership_expired', 'membership_activated', 'membership_rejected',
  'payment_request', 'payment_marked', 'broadcast', 'generic', 'pr_set', 'waitlist_promoted',
  'waitlist_joined', 'workout_forgotten', 'fitlink_sub_expiring', 'fitlink_sub_expired',
  'session_reminder', 'day_digest', 'tomorrow_digest', 'booking_reminder', 'booking_day_reminder']));

-- Podsetnici pred termin i pregledi dana. p_proba: nista ne upisuje, vraca sta bi poslalo.
-- p_sada: vreme za probu (podrazumevano sada).
CREATE OR REPLACE FUNCTION public.notify_session_reminders(p_proba boolean DEFAULT false, p_sada timestamptz DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_danas date := (p_sada AT TIME ZONE 'Europe/Belgrade')::date;
  v_sat time := (p_sada AT TIME ZONE 'Europe/Belgrade')::time;
  g record;
  ty record;
  v_faza integer;
  v_min integer;
  v_vreme text;
  v_za text;
  v_naslov text;
  v_tekst text;
  v_delovi text[];
  v_napomene jsonb;
  v_redovi text;
  v_broj_tipova integer;
  v_ukupno integer;
  v_jedan record;
  v_dan date;
  v_rec text;
  v_kind text;
  v_poruke jsonb := '[]'::jsonb;
  v_meta jsonb;
BEGIN
  -- 1) Podsetnik pred termin.
  FOR g IN
    WITH k AS (
      SELECT b.trainer_id, b.athlete_id, b.date, b.start_time, b.type_name, b.session_type_id,
             b.capacity, b.guest_name, b.created_at,
             public._pocetak_termina(b.date, b.start_time) AS poc,
             coalesce(p.reminder_leads, ARRAY[15]) AS leads,
             coalesce(p.reminder_grouping, 'by_time') AS grp,
             coalesce(p.reminder_details, true) AS det,
             coalesce(p.reminder_muted_types, '{}') AS utisane
      FROM public.session_bookings b
      LEFT JOIN public.trainer_notification_prefs p ON p.trainer_id = b.trainer_id
      WHERE b.status = 'booked'
        AND b.date BETWEEN v_danas - 1 AND v_danas + 1
    )
    SELECT trainer_id, poc, leads, det, min(date) AS date, min(start_time) AS start_time,
           CASE WHEN grp = 'per_session' THEN coalesce(session_type_id::text, type_name, '') ELSE '' END AS kljuc
    FROM k
    WHERE poc > p_sada AND poc <= p_sada + interval '121 minutes'
      AND cardinality(leads) > 0
      AND (session_type_id IS NULL OR NOT session_type_id = ANY (utisane))
    GROUP BY trainer_id, poc, leads, det,
             CASE WHEN grp = 'per_session' THEN coalesce(session_type_id::text, type_name, '') ELSE '' END
    ORDER BY poc
  LOOP
    -- Najmanji podsetnik koji je dosao na red. Ako je vec poslat taj ili manji, nista;
    -- kasno upisan termin (npr. 5 min pre) dobija jedan podsetnik, ne sve odjednom.
    SELECT min(l) INTO v_faza FROM unnest(g.leads) l WHERE g.poc - make_interval(mins => l) <= p_sada;
    CONTINUE WHEN v_faza IS NULL;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.recipient_id = g.trainer_id AND n.kind = 'session_reminder'
        AND n.meta->>'termin_at' = extract(epoch FROM g.poc)::bigint::text
        AND coalesce(n.meta->>'kljuc', '') = g.kljuc
        AND (n.meta->>'lead')::int <= v_faza
    );
    CONTINUE WHEN NOT public.trainer_has_active_fitlink_sub(g.trainer_id);

    v_min := ceil(extract(epoch FROM (g.poc - p_sada)) / 60)::int;
    v_za := public._za_minuta(v_min);
    v_za := upper(left(v_za, 1)) || substr(v_za, 2);
    v_vreme := to_char(g.poc AT TIME ZONE 'Europe/Belgrade', 'FMHH24:MI');
    v_delovi := ARRAY[]::text[];
    v_napomene := '{}'::jsonb;
    v_broj_tipova := 0;
    v_ukupno := 0;

    FOR ty IN
      SELECT coalesce(nullif(btrim(b.type_name), ''), 'Trening') AS tip,
             max(b.capacity) AS kapacitet,
             count(*)::int AS n,
             array_agg(coalesce(nullif(btrim(pr.full_name), ''), nullif(btrim(b.guest_name), ''), 'Gost')
                       ORDER BY b.created_at) AS imena,
             array_agg(CASE WHEN g.det THEN
                         public._napomena_termina(b.trainer_id, b.athlete_id, b.date, b.start_time) END
                       ORDER BY b.created_at) AS napomene
      FROM public.session_bookings b
      LEFT JOIN public.profiles pr ON pr.id = b.athlete_id
      LEFT JOIN public.trainer_notification_prefs p ON p.trainer_id = b.trainer_id
      WHERE b.trainer_id = g.trainer_id AND b.status = 'booked'
        AND b.date = g.date AND b.start_time = g.start_time
        AND (g.kljuc = '' OR coalesce(b.session_type_id::text, b.type_name, '') = g.kljuc)
        AND (b.session_type_id IS NULL OR NOT b.session_type_id = ANY (coalesce(p.reminder_muted_types, '{}')))
      GROUP BY 1
      ORDER BY min(b.created_at)
    LOOP
      v_broj_tipova := v_broj_tipova + 1;
      v_ukupno := v_ukupno + ty.n;
      v_jedan := ty;
      v_delovi := v_delovi || (ty.tip
        || CASE WHEN coalesce(ty.kapacitet, 1) > 1 THEN ' (' || ty.n || '/' || ty.kapacitet || ')' ELSE '' END
        || ': ' || public._spisak_imena(ty.imena, 3));
      FOR i IN 1 .. cardinality(ty.imena) LOOP
        IF ty.napomene[i] IS NOT NULL THEN
          v_napomene := jsonb_set(v_napomene, ARRAY[ty.napomene[i]],
            coalesce(v_napomene -> ty.napomene[i], '[]'::jsonb) || to_jsonb(ty.imena[i]));
        END IF;
      END LOOP;
    END LOOP;
    CONTINUE WHEN v_broj_tipova = 0;
    -- Napomene po vrsti: "Članarina nije plaćena: Ana i Luka" (najvise dva reda).
    SELECT string_agg(upper(left(e.key, 1)) || substr(e.key, 2) || ': '
                      || public._spisak_imena(ARRAY(SELECT jsonb_array_elements_text(e.value)), 3), E'\n')
      INTO v_redovi
    FROM (SELECT key, value FROM jsonb_each(v_napomene) ORDER BY jsonb_array_length(value) DESC, key LIMIT 2) e;

    IF v_broj_tipova = 1 AND v_jedan.n = 1 THEN
      -- Jedan klijent: ime u naslovu, napomena uz trening.
      v_naslov := v_za || ': ' || v_jedan.imena[1];
      v_tekst := v_jedan.tip || ' u ' || v_vreme
        || coalesce(' · ' || v_jedan.napomene[1], '');
    ELSIF v_broj_tipova = 1 THEN
      v_naslov := v_za || ': ' || v_jedan.tip || ' u ' || v_vreme;
      v_tekst := CASE WHEN coalesce(v_jedan.kapacitet, 1) > 1 THEN v_jedan.n || '/' || v_jedan.kapacitet || ' · ' ELSE '' END
        || public._spisak_imena(v_jedan.imena, 4);
      IF v_redovi IS NOT NULL THEN
        v_tekst := v_tekst || E'\n' || v_redovi;
      END IF;
    ELSE
      v_naslov := v_za || ' u ' || v_vreme || ': ' || public._broj_klijenata(v_ukupno);
      v_tekst := array_to_string(v_delovi, E'\n');
      IF v_redovi IS NOT NULL THEN
        v_tekst := v_tekst || E'\n' || v_redovi;
      END IF;
    END IF;

    v_meta := jsonb_build_object(
      'termin_at', extract(epoch FROM g.poc)::bigint::text, 'kljuc', g.kljuc, 'lead', v_faza,
      'slot_date', g.date, 'start_time', to_char(g.start_time, 'HH24:MI'));
    IF p_proba THEN
      v_poruke := v_poruke || jsonb_build_object('trener', g.trainer_id, 'kind', 'session_reminder',
        'naslov', v_naslov, 'tekst', v_tekst, 'meta', v_meta);
    ELSE
      INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
      VALUES (g.trainer_id, 'trainer', NULL, g.trainer_id, 'session_reminder', v_naslov, v_tekst, v_meta);
      v_poruke := v_poruke || jsonb_build_object('kind', 'session_reminder');
    END IF;
  END LOOP;

  -- 2) Pregled dana: jutarnji (danas) i vecernji (sutra). Stize u prvih 10 min posle
  --    izabranog vremena, jednom za taj dan, i samo kad ima termina.
  FOR g IN
    SELECT p.trainer_id, p.reminder_muted_types AS utisane, x.vrsta, x.u
    FROM public.trainer_notification_prefs p
    CROSS JOIN LATERAL (VALUES ('day_digest', p.morning_digest_at), ('tomorrow_digest', p.evening_digest_at)) x(vrsta, u)
    WHERE x.u IS NOT NULL AND v_sat >= x.u AND v_sat < x.u + interval '10 minutes'
  LOOP
    v_kind := g.vrsta;
    v_dan := CASE WHEN v_kind = 'day_digest' THEN v_danas ELSE v_danas + 1 END;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.recipient_id = g.trainer_id AND n.kind = v_kind AND n.meta->>'dan' = v_dan::text
    );
    CONTINUE WHEN NOT public.trainer_has_active_fitlink_sub(g.trainer_id);

    SELECT count(DISTINCT (b.start_time, coalesce(b.session_type_id::text, b.type_name, '')))::int AS termina,
           count(*)::int AS klijenata,
           min(b.start_time) AS prvi, max(b.start_time) AS poslednji
      INTO v_jedan
    FROM public.session_bookings b
    WHERE b.trainer_id = g.trainer_id AND b.status = 'booked' AND b.date = v_dan
      AND public._pocetak_termina(b.date, b.start_time) > p_sada
      AND (b.session_type_id IS NULL OR NOT b.session_type_id = ANY (g.utisane));
    CONTINUE WHEN coalesce(v_jedan.termina, 0) = 0;

    -- Ko je na prvom terminu.
    SELECT CASE WHEN count(*) = 1
                THEN min(coalesce(nullif(btrim(pr.full_name), ''), nullif(btrim(b.guest_name), ''), 'Gost'))
                     || ' (' || min(coalesce(nullif(btrim(b.type_name), ''), 'Trening')) || ')'
                ELSE min(coalesce(nullif(btrim(b.type_name), ''), 'Trening')) || ', ' || public._broj_klijenata(count(*)::int)
           END INTO v_rec
    FROM public.session_bookings b
    LEFT JOIN public.profiles pr ON pr.id = b.athlete_id
    WHERE b.trainer_id = g.trainer_id AND b.status = 'booked' AND b.date = v_dan
      AND b.start_time = v_jedan.prvi
      AND (b.session_type_id IS NULL OR NOT b.session_type_id = ANY (g.utisane));

    v_naslov := CASE WHEN v_kind = 'day_digest' THEN 'Danas ' ELSE 'Sutra ' END
      || v_jedan.termina || ' ' || CASE WHEN v_jedan.termina % 10 = 1 AND v_jedan.termina % 100 <> 11 THEN 'termin' ELSE 'termina' END
      || ', ' || public._broj_klijenata(v_jedan.klijenata);
    v_tekst := 'Prvi u ' || to_char(v_jedan.prvi, 'FMHH24:MI') || ': ' || v_rec
      || CASE WHEN v_jedan.poslednji > v_jedan.prvi THEN E'\nPoslednji u ' || to_char(v_jedan.poslednji, 'FMHH24:MI') ELSE '' END;

    v_meta := jsonb_build_object('dan', v_dan::text, 'slot_date', v_dan);
    IF p_proba THEN
      v_poruke := v_poruke || jsonb_build_object('trener', g.trainer_id, 'kind', v_kind,
        'naslov', v_naslov, 'tekst', v_tekst, 'meta', v_meta);
    ELSE
      INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
      VALUES (g.trainer_id, 'trainer', NULL, g.trainer_id, v_kind, v_naslov, v_tekst, v_meta);
      v_poruke := v_poruke || jsonb_build_object('kind', v_kind);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('poruke', v_poruke);
END;
$function$;

-- 2) Podsetnici vezbacima.

-- Podsetnici za termine vezbacima.
--
-- Trener podesava za sve svoje klijente (Podesavanja > Podsetnici za klijente), kolone client_*
-- u trainer_notification_prefs:
--   client_reminders     glavni prekidac (cuva izabrana vremena kad se iskljuci)
--   client_reminder_leads  minuta pre termina, od 15, 30, 60, 120, 180
--   client_evening_at    vece pre termina u izabrano vreme (NULL = ne)
--   client_morning_at    ujutru na dan termina u izabrano vreme (NULL = ne)
--                        ukupno najvise 3 podsetnika (leads + vece + jutro)
--   client_cancel_info   red "Otkazivanje bez gubitka treninga do 16:00" (po trainers.cancel_cutoff_hours)
--   client_message       recenica trenera u svakom podsetniku (do 140 znakova)
--   client_muted_types   vrste treninga bez podsetnika
-- Trener bez reda: ukljuceno, 1 h pre, sa rokom za otkazivanje.
--
-- Vezbac samo gasi za sebe: athlete_notification_prefs.session_reminders, kroz
-- set_my_session_reminders; my_session_reminders vraca sta mu trener salje.
--
-- Vrste: booking_reminder (pred termin), booking_day_reminder (vece pre / jutro, meta.faza).
-- Push ide sam kroz trg_notifications_send_push. Gost (athlete_id NULL) ne dobija nista.

ALTER TABLE public.trainer_notification_prefs
  ADD COLUMN IF NOT EXISTS client_reminders boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS client_reminder_leads integer[] NOT NULL DEFAULT ARRAY[60],
  ADD COLUMN IF NOT EXISTS client_evening_at time,
  ADD COLUMN IF NOT EXISTS client_morning_at time,
  ADD COLUMN IF NOT EXISTS client_cancel_info boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS client_message text,
  ADD COLUMN IF NOT EXISTS client_muted_types uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.trainer_notification_prefs DROP CONSTRAINT IF EXISTS trainer_notif_prefs_klijenti;
ALTER TABLE public.trainer_notification_prefs ADD CONSTRAINT trainer_notif_prefs_klijenti CHECK (
  client_reminder_leads <@ ARRAY[15, 30, 60, 120, 180]
  AND cardinality(client_reminder_leads)
      + (client_evening_at IS NOT NULL)::int + (client_morning_at IS NOT NULL)::int <= 3
  AND (client_message IS NULL OR char_length(client_message) <= 140)
);

CREATE TABLE IF NOT EXISTS public.athlete_notification_prefs (
  athlete_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  session_reminders boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.athlete_notification_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "athlete reads own prefs" ON public.athlete_notification_prefs;
CREATE POLICY "athlete reads own prefs" ON public.athlete_notification_prefs
  FOR SELECT TO authenticated USING (athlete_id = auth.uid());
-- Upis samo kroz set_my_session_reminders.

-- "do 16:00", "do sutra u 16:00", "do 12.11. u 16:00" (u odnosu na p_sada, po Beogradu).
CREATE OR REPLACE FUNCTION public._rok_otkazivanja(p_rok timestamptz, p_sada timestamptz)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE
    WHEN (p_rok AT TIME ZONE 'Europe/Belgrade')::date = (p_sada AT TIME ZONE 'Europe/Belgrade')::date
      THEN 'do ' || to_char(p_rok AT TIME ZONE 'Europe/Belgrade', 'FMHH24:MI')
    WHEN (p_rok AT TIME ZONE 'Europe/Belgrade')::date = (p_sada AT TIME ZONE 'Europe/Belgrade')::date + 1
      THEN 'do sutra u ' || to_char(p_rok AT TIME ZONE 'Europe/Belgrade', 'FMHH24:MI')
    ELSE 'do ' || to_char(p_rok AT TIME ZONE 'Europe/Belgrade', 'FMDD.FMMM. u FMHH24:MI')
  END;
$function$;

-- Ime trenera za podsetnik: "Marko Petrović" ili "tvoj trener".
CREATE OR REPLACE FUNCTION public._ime_trenera(p_trainer uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce((SELECT nullif(btrim(full_name), '') FROM public.profiles WHERE id = p_trainer), 'tvoj trener');
$function$;

-- Podsetnici vezbacima. p_proba: nista ne upisuje, vraca sta bi poslalo.
CREATE OR REPLACE FUNCTION public.notify_athlete_session_reminders(p_proba boolean DEFAULT false, p_sada timestamptz DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_danas date := (p_sada AT TIME ZONE 'Europe/Belgrade')::date;
  v_sat time := (p_sada AT TIME ZONE 'Europe/Belgrade')::time;
  b record;
  g record;
  v_faza integer;
  v_min integer;
  v_za text;
  v_naslov text;
  v_tekst text;
  v_rok timestamptz;
  v_meta jsonb;
  v_kind text;
  v_dan date;
  v_vremena text[];
  v_poruke jsonb := '[]'::jsonb;
BEGIN
  -- 1) Pred termin (15 min do 3 h).
  FOR b IN
    SELECT s.id, s.trainer_id, s.athlete_id, s.date, s.start_time, s.created_at,
           coalesce(nullif(btrim(s.type_name), ''), 'Trening') AS tip,
           public._pocetak_termina(s.date, s.start_time) AS poc,
           coalesce(p.client_reminder_leads, ARRAY[60]) AS leads,
           coalesce(p.client_cancel_info, true) AS rok_info,
           nullif(btrim(p.client_message), '') AS poruka,
           coalesce(t.cancel_cutoff_hours, 0) AS rok_h
    FROM public.session_bookings s
    LEFT JOIN public.trainer_notification_prefs p ON p.trainer_id = s.trainer_id
    LEFT JOIN public.trainers t ON t.id = s.trainer_id
    LEFT JOIN public.athlete_notification_prefs a ON a.athlete_id = s.athlete_id
    WHERE s.status = 'booked'
      AND s.athlete_id IS NOT NULL
      AND s.date BETWEEN v_danas - 1 AND v_danas + 1
      AND coalesce(p.client_reminders, true)
      AND coalesce(a.session_reminders, true)
      AND (s.session_type_id IS NULL OR NOT s.session_type_id = ANY (coalesce(p.client_muted_types, '{}')))
  LOOP
    CONTINUE WHEN NOT (b.poc > p_sada AND b.poc <= p_sada + interval '181 minutes');
    -- Najmanji podsetnik koji je dosao na red, a termin je zakazan pre njega
    -- (ko zakaze 20 min pre, ne dobija "za 20 min" odmah posle zakazivanja).
    SELECT min(l) INTO v_faza FROM unnest(b.leads) l
    WHERE b.poc - make_interval(mins => l) <= p_sada
      AND b.created_at <= b.poc - make_interval(mins => l);
    CONTINUE WHEN v_faza IS NULL;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.recipient_id = b.athlete_id AND n.kind = 'booking_reminder'
        AND n.meta->>'booking_id' = b.id::text
        AND (n.meta->>'lead')::int <= v_faza
    );
    CONTINUE WHEN NOT public.trainer_has_active_fitlink_sub(b.trainer_id);

    v_min := ceil(extract(epoch FROM (b.poc - p_sada)) / 60)::int;
    v_za := public._za_minuta(v_min);
    v_naslov := 'Trening ' || v_za;
    v_tekst := b.tip || ' u ' || to_char(b.poc AT TIME ZONE 'Europe/Belgrade', 'FMHH24:MI')
      || ', trener ' || public._ime_trenera(b.trainer_id);
    IF b.rok_info AND b.rok_h > 0 THEN
      v_rok := b.poc - make_interval(hours => b.rok_h);
      IF v_rok > p_sada THEN
        v_tekst := v_tekst || E'\nOtkazivanje bez gubitka treninga ' || public._rok_otkazivanja(v_rok, p_sada);
      END IF;
    END IF;
    IF b.poruka IS NOT NULL THEN
      v_tekst := v_tekst || E'\n' || b.poruka;
    END IF;

    v_meta := jsonb_build_object('booking_id', b.id::text, 'lead', v_faza,
      'termin_at', extract(epoch FROM b.poc)::bigint::text,
      'slot_date', b.date, 'start_time', to_char(b.start_time, 'HH24:MI'));
    IF p_proba THEN
      v_poruke := v_poruke || jsonb_build_object('vezbac', b.athlete_id, 'kind', 'booking_reminder',
        'naslov', v_naslov, 'tekst', v_tekst, 'meta', v_meta);
    ELSE
      INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
      VALUES (b.athlete_id, 'athlete', b.trainer_id, b.athlete_id, 'booking_reminder', v_naslov, v_tekst, v_meta);
      v_poruke := v_poruke || jsonb_build_object('kind', 'booking_reminder');
    END IF;
  END LOOP;

  -- 2) Vece pre (sutrasnji termini) i jutro (danasnji). Stize u prvih 10 min posle izabranog
  --    vremena, jednom po vezbacu i danu; vise termina istog dana ide u jednu poruku.
  FOR g IN
    SELECT s.athlete_id, s.trainer_id, x.faza, s.date,
           bool_and(coalesce(p.client_cancel_info, true)) AS rok_info,
           min(nullif(btrim(p.client_message), '')) AS poruka,
           min(coalesce(t.cancel_cutoff_hours, 0)) AS rok_h,
           array_agg(public._pocetak_termina(s.date, s.start_time) ORDER BY s.start_time) AS pocetci,
           array_agg(coalesce(nullif(btrim(s.type_name), ''), 'Trening') ORDER BY s.start_time) AS tipovi
    FROM public.trainer_notification_prefs p
    CROSS JOIN LATERAL (VALUES ('vece', p.client_evening_at, v_danas + 1), ('jutro', p.client_morning_at, v_danas)) x(faza, u, dan)
    JOIN public.session_bookings s ON s.trainer_id = p.trainer_id AND s.date = x.dan
    LEFT JOIN public.trainers t ON t.id = s.trainer_id
    LEFT JOIN public.athlete_notification_prefs a ON a.athlete_id = s.athlete_id
    WHERE p.client_reminders
      AND x.u IS NOT NULL AND v_sat >= x.u AND v_sat < x.u + interval '10 minutes'
      AND s.status = 'booked' AND s.athlete_id IS NOT NULL
      AND public._pocetak_termina(s.date, s.start_time) > p_sada
      -- Jutro preskace termin za koji uskoro stize podsetnik pred termin (dve poruke u istom trenu).
      AND (x.faza = 'vece' OR public._pocetak_termina(s.date, s.start_time)
           - make_interval(mins => coalesce((SELECT max(l) FROM unnest(p.client_reminder_leads) l), 0))
           > p_sada + interval '30 minutes')
      AND coalesce(a.session_reminders, true)
      AND (s.session_type_id IS NULL OR NOT s.session_type_id = ANY (p.client_muted_types))
    GROUP BY s.athlete_id, s.trainer_id, x.faza, s.date
  LOOP
    v_kind := 'booking_day_reminder';
    v_dan := g.date;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.recipient_id = g.athlete_id AND n.kind = v_kind
        AND n.meta->>'dan' = v_dan::text AND n.meta->>'faza' = g.faza
    );
    CONTINUE WHEN NOT public.trainer_has_active_fitlink_sub(g.trainer_id);

    v_vremena := ARRAY(SELECT to_char(x AT TIME ZONE 'Europe/Belgrade', 'FMHH24:MI') FROM unnest(g.pocetci) x);
    IF cardinality(v_vremena) = 1 THEN
      v_naslov := CASE WHEN g.faza = 'vece' THEN 'Sutra' ELSE 'Danas' END || ' trening u ' || v_vremena[1];
      v_tekst := g.tipovi[1] || ', trener ' || public._ime_trenera(g.trainer_id);
    ELSE
      v_naslov := CASE WHEN g.faza = 'vece' THEN 'Sutra' ELSE 'Danas' END || ' ' || cardinality(v_vremena)
        || ' treninga: ' || public._spisak_imena(v_vremena, 4);
      v_tekst := 'Trener ' || public._ime_trenera(g.trainer_id);
    END IF;
    IF g.rok_info AND g.rok_h > 0 THEN
      v_rok := g.pocetci[1] - make_interval(hours => g.rok_h);
      IF v_rok > p_sada THEN
        v_tekst := v_tekst || E'\nOtkazivanje bez gubitka treninga ' || public._rok_otkazivanja(v_rok, p_sada);
      END IF;
    END IF;
    IF g.poruka IS NOT NULL THEN
      v_tekst := v_tekst || E'\n' || g.poruka;
    END IF;

    v_meta := jsonb_build_object('dan', v_dan::text, 'faza', g.faza, 'slot_date', v_dan,
      'start_time', to_char(g.pocetci[1] AT TIME ZONE 'Europe/Belgrade', 'HH24:MI'));
    IF p_proba THEN
      v_poruke := v_poruke || jsonb_build_object('vezbac', g.athlete_id, 'kind', v_kind,
        'naslov', v_naslov, 'tekst', v_tekst, 'meta', v_meta);
    ELSE
      INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
      VALUES (g.athlete_id, 'athlete', g.trainer_id, g.athlete_id, v_kind, v_naslov, v_tekst, v_meta);
      v_poruke := v_poruke || jsonb_build_object('kind', v_kind);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('poruke', v_poruke);
END;
$function$;

-- Vezbac: sta mu trener salje i da li je sam iskljucio.
CREATE OR REPLACE FUNCTION public.my_session_reminders()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_trener uuid;
  p record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nisi prijavljen';
  END IF;
  SELECT trainer_id INTO v_trener FROM public.athletes WHERE id = v_uid;
  SELECT * INTO p FROM public.trainer_notification_prefs WHERE trainer_id = v_trener;

  RETURN jsonb_build_object(
    'ukljuceno', coalesce((SELECT session_reminders FROM public.athlete_notification_prefs WHERE athlete_id = v_uid), true),
    'ima_trenera', v_trener IS NOT NULL,
    'trener', CASE WHEN v_trener IS NULL THEN NULL ELSE public._ime_trenera(v_trener) END,
    'trener_salje', coalesce(p.client_reminders, true),
    'leads', to_jsonb(coalesce(p.client_reminder_leads, ARRAY[60])),
    'vece', to_char(p.client_evening_at, 'HH24:MI'),
    'jutro', to_char(p.client_morning_at, 'HH24:MI'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_my_session_reminders(p_ukljuceno boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nisi prijavljen';
  END IF;
  INSERT INTO public.athlete_notification_prefs (athlete_id, session_reminders, updated_at)
  VALUES (auth.uid(), coalesce(p_ukljuceno, true), now())
  ON CONFLICT (athlete_id) DO UPDATE SET session_reminders = EXCLUDED.session_reminders, updated_at = now();
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._rok_otkazivanja(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._ime_trenera(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_athlete_session_reminders(boolean, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.my_session_reminders() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_my_session_reminders(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_session_reminders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_session_reminders(boolean) TO authenticated;

-- Svakog minuta, kao i podsetnici treneru.
SELECT cron.schedule('athlete-session-reminders', '* * * * *', $$select public.notify_athlete_session_reminders();$$);
