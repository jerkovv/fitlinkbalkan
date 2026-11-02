-- Već primenjeno na bazu preko MCP; ovaj fajl je samo za version control.
--
-- Vezbac: clanarina ističe za 1-3 dana, danas, istekla (do 3 dana posle) i potrosen
-- paket termina. Trener: FitLink pretplata ističe za 1-3 dana, danas, istekla, i
-- placanje nije proslo. Stripe pretplata koja se sama obnavlja ne dobija "produzi".
-- Podsetnici za istek: vezbacu za clanarinu kod trenera, treneru za FitLink pretplatu.
-- Svaka faza stize jednom (proverava se u notifications.meta), samo od 9 do 21h po Beogradu.
CREATE OR REPLACE FUNCTION public.notify_membership_expiry()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sada timestamptz := now();
  v_danas date := (now() AT TIME ZONE 'Europe/Belgrade')::date;
  v_sat int := extract(hour FROM (now() AT TIME ZONE 'Europe/Belgrade'))::int;
  r record;
  v_faze text[];
  v_x text;
  v_faza text;
  v_dana int;
  v_do date;
  v_kind text;
  v_naslov text;
  v_tekst text;
  v_paket text;
  v_vezbaca int;
  v_posledica text;
  v_proba boolean;
  v_kljuc text;
  v_broj int := 0;
BEGIN
  IF v_sat < 9 OR v_sat >= 21 THEN
    RETURN 0;
  END IF;

  -- 1) Vezbac: poslednja aktivna clanarina kod trenera.
  FOR r IN
    SELECT DISTINCT ON (m.athlete_id)
           m.id, m.athlete_id, m.trainer_id, m.plan_name, m.ends_on, m.sessions_total, m.sessions_used
    FROM public.memberships m
    WHERE m.status = 'active'
    ORDER BY m.athlete_id, m.ends_on DESC NULLS FIRST, m.created_at DESC
  LOOP
    -- Samo kod sadasnjeg trenera koji placa FitLink (inace vezbac ionako ne moze da zatrazi paket),
    -- i ne kad je zahtev za novi paket vec poslat.
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM public.athletes a WHERE a.id = r.athlete_id AND a.trainer_id = r.trainer_id
    );
    CONTINUE WHEN NOT public.trainer_has_active_fitlink_sub(r.trainer_id);
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.membership_purchases p WHERE p.athlete_id = r.athlete_id AND p.status = 'pending'
    );

    v_faze := ARRAY[]::text[];
    v_dana := NULL;
    IF r.ends_on IS NOT NULL THEN
      v_dana := r.ends_on - v_danas;
      IF v_dana BETWEEN 1 AND 3 THEN v_faze := v_faze || 'dana3'::text;
      ELSIF v_dana = 0 THEN v_faze := v_faze || 'danas'::text;
      ELSIF v_dana BETWEEN -3 AND -1 THEN v_faze := v_faze || 'istekla'::text;
      END IF;
    END IF;
    -- Potrosen paket termina (book_session tada vise ne pusta), dok clanarina jos vazi.
    IF r.sessions_total IS NOT NULL AND (r.ends_on IS NULL OR r.ends_on >= v_danas)
       AND COALESCE(r.sessions_used, 0) >= r.sessions_total THEN
      v_faze := v_faze || 'termini0'::text;
    END IF;

    v_faza := NULL;
    FOREACH v_x IN ARRAY v_faze LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.recipient_id = r.athlete_id
          AND n.kind IN ('membership_expiring', 'membership_expired')
          AND n.meta->>'membership_id' = r.id::text
          AND n.meta->>'faza' = v_x
      ) THEN
        v_faza := v_x;
        EXIT;
      END IF;
    END LOOP;
    CONTINUE WHEN v_faza IS NULL;

    v_paket := NULLIF(trim(r.plan_name), '');
    v_kind := 'membership_expiring';
    IF v_faza = 'dana3' THEN
      v_naslov := CASE WHEN v_dana = 1 THEN 'Članarina ističe sutra'
                       ELSE 'Članarina ističe za ' || v_dana || ' dana' END;
      v_tekst := COALESCE('Paket ' || v_paket || ' važi', 'Članarina važi') || ' do '
                 || to_char(r.ends_on, 'DD.MM.') || ' Produži je na vreme da treninzi idu bez pauze.';
    ELSIF v_faza = 'danas' THEN
      v_naslov := 'Članarina ističe danas';
      v_tekst := 'Danas je poslednji dan članarine. Produži je u aplikaciji i nastavi bez pauze.';
    ELSIF v_faza = 'istekla' THEN
      v_kind := 'membership_expired';
      v_naslov := 'Članarina je istekla';
      v_tekst := 'Članarina je istekla ' || to_char(r.ends_on, 'DD.MM.')
                 || ' Zatraži novi paket u aplikaciji i vrati se treninzima.';
    ELSE
      v_naslov := 'Potrošeni su svi termini';
      v_tekst := COALESCE('Paket ' || v_paket, 'Paket') || ' više nema slobodnih termina. '
                 || 'Zatraži novi paket i nastavi da zakazuješ.';
    END IF;

    INSERT INTO public.notifications
      (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
    VALUES (r.athlete_id, 'athlete', NULL, r.athlete_id, v_kind, v_naslov, v_tekst,
            jsonb_build_object('membership_id', r.id, 'faza', v_faza));
    v_broj := v_broj + 1;
  END LOOP;

  -- 2) Trener: FitLink pretplata.
  FOR r IN
    SELECT ts.id, ts.trainer_id, ts.status::text AS status, ts.access_until,
           (ts.stripe_subscription_id IS NOT NULL AND NOT COALESCE(ts.cancel_at_period_end, false)
            AND ts.status IN ('active', 'trialing')) AS obnavlja_se
    FROM public.trainer_subscriptions ts
    WHERE ts.access_until IS NOT NULL
      AND ts.access_until > v_sada - interval '4 days'
      AND ts.access_until < v_sada + interval '4 days'
      AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = ts.trainer_id AND ur.role = 'trainer')
  LOOP
    v_do := (r.access_until AT TIME ZONE 'Europe/Belgrade')::date;
    v_dana := v_do - v_danas;
    v_faza := NULL;
    IF r.access_until > v_sada THEN
      IF r.status = 'past_due' THEN
        v_faza := 'placanje';
      ELSIF NOT r.obnavlja_se THEN
        -- Stripe koji se sam obnavlja ne dobija "produzi"; javlja se samo kad placanje ne prodje.
        v_faza := CASE WHEN v_dana = 0 THEN 'danas' WHEN v_dana BETWEEN 1 AND 3 THEN 'dana3' END;
      END IF;
    ELSIF NOT public.trainer_has_active_fitlink_sub(r.trainer_id)
          -- Obnova preko Stripe-a stize webhook-om malo posle isteka; ne javljamo u tom procepu.
          AND r.access_until < v_sada - (CASE WHEN r.obnavlja_se THEN interval '24 hours' ELSE interval '1 hour' END) THEN
      v_faza := 'istekla';
    END IF;
    CONTINUE WHEN v_faza IS NULL;

    v_kljuc := extract(epoch FROM r.access_until)::bigint::text;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.recipient_id = r.trainer_id
        AND n.kind IN ('fitlink_sub_expiring', 'fitlink_sub_expired')
        AND n.meta->>'faza' = v_faza
        AND n.meta->>'access_until' = v_kljuc
    );

    SELECT count(*) INTO v_vezbaca FROM public.athletes a WHERE a.trainer_id = r.trainer_id;
    v_proba := r.status = 'trialing';
    v_posledica := CASE
      WHEN v_vezbaca = 0 THEN ' Kad istekne, izmene se zaključavaju.'
      WHEN v_vezbaca % 10 = 1 AND v_vezbaca % 100 <> 11
        THEN ' Kad istekne, izmene se zaključavaju, a ' || v_vezbaca || ' vežbač gubi pristup treninzima.'
      WHEN v_vezbaca % 10 BETWEEN 2 AND 4 AND v_vezbaca % 100 NOT BETWEEN 12 AND 14
        THEN ' Kad istekne, izmene se zaključavaju, a ' || v_vezbaca || ' vežbača gube pristup treninzima.'
      ELSE ' Kad istekne, izmene se zaključavaju, a ' || v_vezbaca || ' vežbača gubi pristup treninzima.'
    END;

    v_kind := 'fitlink_sub_expiring';
    IF v_faza = 'dana3' THEN
      v_naslov := CASE WHEN v_proba THEN 'Probni period' ELSE 'FitLink pretplata' END
                  || CASE WHEN v_dana = 1 THEN ' ističe sutra' ELSE ' ističe za ' || v_dana || ' dana' END;
      v_tekst := 'Važi do ' || to_char(v_do, 'DD.MM.') || v_posledica;
    ELSIF v_faza = 'danas' THEN
      v_naslov := CASE WHEN v_proba THEN 'Probni period' ELSE 'FitLink pretplata' END || ' ističe danas';
      v_tekst := 'Danas je poslednji dan.' || v_posledica;
    ELSIF v_faza = 'placanje' THEN
      v_naslov := 'Plaćanje pretplate nije prošlo';
      v_tekst := 'Proveri način plaćanja da pretplata ne istekne '
                 || CASE WHEN v_dana = 0 THEN 'danas.' ELSE to_char(v_do, 'DD.MM.') END;
    ELSE
      v_kind := 'fitlink_sub_expired';
      v_naslov := CASE WHEN v_proba THEN 'Probni period je istekao' ELSE 'FitLink pretplata je istekla' END;
      v_tekst := CASE WHEN v_vezbaca > 0
        THEN 'Izmene su zaključane, a vežbači ne mogu da treniraju dok ne produžiš pretplatu.'
        ELSE 'Izmene su zaključane dok ne produžiš pretplatu.' END;
    END IF;

    INSERT INTO public.notifications
      (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
    VALUES (r.trainer_id, 'trainer', NULL, r.trainer_id, v_kind, v_naslov, v_tekst,
            jsonb_build_object('subscription_id', r.id, 'faza', v_faza, 'access_until', v_kljuc));
    v_broj := v_broj + 1;
  END LOOP;

  RETURN v_broj;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_membership_expiry() FROM PUBLIC, anon, authenticated;

-- Svakog sata u :05; funkcija sama cuti van 9-21h po Beogradu.
SELECT cron.schedule('membership-expiry-push', '5 * * * *', 'select public.notify_membership_expiry();');
