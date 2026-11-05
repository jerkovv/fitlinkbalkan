-- Podsetnici za termine (trener).
--
-- Trener bira u aplikaciji (Podesavanja > Sta ti stize > Podsetnici za termine):
--   reminder_leads     koliko minuta pre termina stize podsetnik; vise vrednosti = vise
--                      podsetnika (npr. sat i 15 min ranije); prazan niz = iskljuceno.
--   reminder_muted_types  vrste treninga (session_types.id) za koje trener NE zeli podsetnik
--                      ni pregled dana; prazno = sve vrste.
--   reminder_grouping  by_time: jedna notifikacija za sve klijente koji pocinju u isto vreme;
--                      per_session: posebno za svaki termin (vrstu treninga) u to vreme.
--   reminder_details   napomena uz klijenta: clanarina nije placena, istekla, istice danas
--                      ili sutra, prvi termin kod tebe.
--   morning_digest_at  jutarnji pregled dana (NULL = iskljuceno).
--   evening_digest_at  vecernji pregled sutrasnjeg dana (NULL = iskljuceno).
-- Trener bez reda dobija podrazumevano: 15 min pre, svi termini, jedna za sve u isto vreme.
--
-- Vrste obavestenja: session_reminder, day_digest, tomorrow_digest. Isto vazi muted_kinds
-- (tg_notifications_trainer_prefs), a push ide sam kroz trg_notifications_send_push.
-- Cron svakog minuta; svaki termin i svaki pregled stize jednom (provera u notifications.meta).

ALTER TABLE public.trainer_notification_prefs
  ADD COLUMN IF NOT EXISTS reminder_leads integer[] NOT NULL DEFAULT ARRAY[15],
  ADD COLUMN IF NOT EXISTS reminder_muted_types uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reminder_grouping text NOT NULL DEFAULT 'by_time',
  ADD COLUMN IF NOT EXISTS reminder_details boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS morning_digest_at time,
  ADD COLUMN IF NOT EXISTS evening_digest_at time;

ALTER TABLE public.trainer_notification_prefs DROP CONSTRAINT IF EXISTS trainer_notif_prefs_podsetnici;
ALTER TABLE public.trainer_notification_prefs ADD CONSTRAINT trainer_notif_prefs_podsetnici CHECK (
  reminder_grouping IN ('by_time', 'per_session')
  AND reminder_leads <@ ARRAY[5, 10, 15, 30, 45, 60, 120]
  AND cardinality(reminder_leads) <= 3
);

-- "za 15 min", "za 1 h", "za 1 h 30 min"
CREATE OR REPLACE FUNCTION public._za_minuta(p_min integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_min < 60 THEN 'za ' || greatest(p_min, 1) || ' min'
    WHEN p_min % 60 = 0 THEN 'za ' || (p_min / 60) || ' h'
    ELSE 'za ' || (p_min / 60) || ' h ' || (p_min % 60) || ' min'
  END;
$function$;

-- "1 klijent", "3 klijenta", "5 klijenata"
CREATE OR REPLACE FUNCTION public._broj_klijenata(p_n integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT p_n || ' ' || CASE
    WHEN p_n % 10 = 1 AND p_n % 100 <> 11 THEN 'klijent'
    WHEN p_n % 10 BETWEEN 2 AND 4 AND p_n % 100 NOT BETWEEN 12 AND 14 THEN 'klijenta'
    ELSE 'klijenata'
  END;
$function$;

-- "Ana", "Ana i Luka", "Ana, Luka i Marija", "Ana, Luka, Marija i još 2"
CREATE OR REPLACE FUNCTION public._spisak_imena(p_imena text[], p_najvise integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN cardinality(p_imena) = 0 THEN ''
    WHEN cardinality(p_imena) = 1 THEN p_imena[1]
    WHEN cardinality(p_imena) <= p_najvise THEN
      array_to_string(p_imena[1:cardinality(p_imena) - 1], ', ') || ' i ' || p_imena[cardinality(p_imena)]
    ELSE array_to_string(p_imena[1:p_najvise], ', ') || ' i još ' || (cardinality(p_imena) - p_najvise)
  END;
$function$;

-- Jedna napomena uz klijenta na terminu; NULL kad nema sta da se kaze.
CREATE OR REPLACE FUNCTION public._napomena_termina(p_trainer uuid, p_athlete uuid, p_date date, p_start time)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_m record;
BEGIN
  IF p_athlete IS NULL THEN
    RETURN NULL; -- gost
  END IF;

  SELECT m.ends_on, m.purchase_id, p.paid_at INTO v_m
  FROM public.memberships m
  LEFT JOIN public.membership_purchases p ON p.id = m.purchase_id
  WHERE m.athlete_id = p_athlete AND m.trainer_id = p_trainer AND m.status = 'active'
    AND (m.ends_on IS NULL OR m.ends_on >= p_date)
  ORDER BY m.ends_on DESC NULLS FIRST, m.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_m.purchase_id IS NOT NULL AND v_m.paid_at IS NULL THEN
      RETURN 'članarina nije plaćena';
    ELSIF v_m.ends_on = p_date THEN
      RETURN 'članarina ističe danas';
    ELSIF v_m.ends_on = p_date + 1 THEN
      RETURN 'članarina ističe sutra';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.memberships m WHERE m.athlete_id = p_athlete AND m.trainer_id = p_trainer) THEN
    -- Samo kad je klijent imao clanarinu; trener koji ih ne vodi ne dobija ovo na svakom terminu.
    RETURN 'članarina je istekla';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.session_bookings b
    WHERE b.trainer_id = p_trainer AND b.athlete_id = p_athlete
      AND b.status IN ('booked', 'attended')
      AND (b.date, b.start_time) < (p_date, p_start)
  ) THEN
    RETURN 'prvi termin kod tebe';
  END IF;

  RETURN NULL;
END;
$function$;

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
      VALUES (g.trainer_id, 'trainer', NULL, NULL, 'session_reminder', v_naslov, v_tekst, v_meta);
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
      VALUES (g.trainer_id, 'trainer', NULL, NULL, v_kind, v_naslov, v_tekst, v_meta);
      v_poruke := v_poruke || jsonb_build_object('kind', v_kind);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('poruke', v_poruke);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._za_minuta(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._broj_klijenata(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._spisak_imena(text[], integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._napomena_termina(uuid, uuid, date, time) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_session_reminders(boolean, timestamptz) FROM PUBLIC, anon, authenticated;

-- Svakog minuta (termini pocinju na pun minut, pa podsetnik stize tacno na vreme).
SELECT cron.schedule('session-reminders', '* * * * *', $$select public.notify_session_reminders();$$);
