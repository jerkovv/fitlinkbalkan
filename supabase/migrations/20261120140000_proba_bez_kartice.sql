-- Proba bez kartice (2026-11-20). Trener dobija 30 dana cim potvrdi mejl, bez Stripe-a; pretplatu
-- (sa karticom) pokrece na fitlink.rs/pretplata pred kraj probe, posle mejlova probe.
--   * _pokreni_probu: red u trainer_subscriptions (trialing, trial_ends_at), samo ako trener nikad nije imao pristup
--   * _posalji_mejl_probe: dnevnik trainer_trial_emails (jednom po koraku) + poziv funkcije trainer-trial-email
--   * okidac na potvrdu mejla: proba + mejl "dobrodoslica" umesto starog "pokreni pretplatu na sajtu"
--   * cron mejlovi-probe: 7 i 3 dana pre, na dan isteka i dan posle (9 do 21h po Beogradu)
--   * okidac na trainer_subscriptions: mejl "pretplata_aktivna" kad trener prvi put plati
--   * notify_membership_expiry: proba bez kartice dobija samo push, mejl salju mejlovi probe
--   * mejl_dogadjaj i email_odjava: prepoznaju i kljuceve iz trainer_trial_emails

create table if not exists public.trainer_trial_emails (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  korak text not null check (korak in ('dobrodoslica', 'proba7', 'proba3', 'proba_danas', 'proba_istekla', 'pretplata_aktivna')),
  resend_id text,
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  open_count integer not null default 0,
  clicked_at timestamptz,
  click_count integer not null default 0,
  greska text,
  unique (trainer_id, korak)
);
alter table public.trainer_trial_emails enable row level security;
revoke all on table public.trainer_trial_emails from anon, authenticated;

-- Proba od 30 dana. Ne dira nalog koji je ikad imao pristup, Stripe pretplatu ili probu.
create or replace function public._pokreni_probu(p_trainer uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_kraj timestamptz := now() + interval '30 days';
  v_id uuid;
begin
  insert into public.trainer_subscriptions (trainer_id, status, access_until, trial_ends_at)
  values (p_trainer, 'trialing', v_kraj, v_kraj)
  on conflict (trainer_id) do update
    set status = 'trialing', access_until = excluded.access_until,
        trial_ends_at = excluded.trial_ends_at, updated_at = now()
    where trainer_subscriptions.access_until is null
      and trainer_subscriptions.stripe_subscription_id is null
      and trainer_subscriptions.trial_ends_at is null
  returning id into v_id;
  return v_id is not null;
end;
$$;
revoke execute on function public._pokreni_probu(uuid) from public, anon, authenticated;

-- Jedan mejl probe, najvise jednom po koraku. Vraca true kad je poziv poslat.
create or replace function public._posalji_mejl_probe(p_trainer uuid, p_korak text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'net', 'vault'
as $$
declare
  v_key text;
  v_id uuid;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_key is null then
    return false;
  end if;
  insert into public.trainer_trial_emails (trainer_id, korak)
  values (p_trainer, p_korak)
  on conflict (trainer_id, korak) do nothing
  returning id into v_id;
  if v_id is null then
    return false;
  end if;
  perform net.http_post(
    url := 'https://iyvvskywmqtudafapxdk.supabase.co/functions/v1/trainer-trial-email',
    body := jsonb_build_object('korak', p_korak, 'trainer_id', p_trainer, 'log_id', v_id),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    timeout_milliseconds := 10000
  );
  return true;
end;
$$;
revoke execute on function public._posalji_mejl_probe(uuid, text) from public, anon, authenticated;

-- Potvrda mejla: trener dobija probu i mejl dobrodoslice (ranije: mejl "pokreni pretplatu na sajtu").
create or replace function public.tg_trener_mejl_pretplata_na_sajtu()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.user_roles ur where ur.user_id = new.id and ur.role = 'trainer') then
    return new;
  end if;
  if public.trainer_has_active_fitlink_sub(new.id) then
    return new;
  end if;
  if public._pokreni_probu(new.id) then
    perform public._posalji_mejl_probe(new.id, 'dobrodoslica');
  end if;
  return new;
exception when others then
  return new;
end;
$$;

-- Podsetnici pred kraj probe. Svaki korak jednom; preskacu se probni nalozi i odjavljeni.
create or replace function public._posalji_mejlove_probe()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sat int := extract(hour from (now() at time zone 'Europe/Belgrade'))::int;
  v_danas date := (now() at time zone 'Europe/Belgrade')::date;
  v_korak text;
  v_dana int;
  v_broj int := 0;
  r record;
begin
  if v_sat < 9 or v_sat >= 21 then
    return 0;
  end if;
  for r in
    select ts.trainer_id, ts.access_until
    from public.trainer_subscriptions ts
    where ts.status = 'trialing'
      and ts.stripe_subscription_id is null
      and ts.trial_ends_at is not null
      and ts.access_until > now() - interval '4 days'
      and ts.access_until < now() + interval '8 days'
      and exists (select 1 from public.user_roles ur where ur.user_id = ts.trainer_id and ur.role = 'trainer')
      and not exists (select 1 from public.admin_test_accounts t where t.user_id = ts.trainer_id)
      and not exists (select 1 from public.email_odjave o where o.user_id = ts.trainer_id)
  loop
    v_dana := (r.access_until at time zone 'Europe/Belgrade')::date - v_danas;
    v_korak := case
      when v_dana between 4 and 7 then 'proba7'
      when v_dana between 1 and 3 then 'proba3'
      when v_dana = 0 and r.access_until > now() then 'proba_danas'
      when v_dana between -3 and -1 then 'proba_istekla'
    end;
    continue when v_korak is null;
    -- Kasniji korak vec poslat: raniji se ne salje unazad.
    continue when v_korak = 'proba7' and exists (
      select 1 from public.trainer_trial_emails e
      where e.trainer_id = r.trainer_id and e.korak in ('proba3', 'proba_danas', 'proba_istekla'));
    if public._posalji_mejl_probe(r.trainer_id, v_korak) then
      v_broj := v_broj + 1;
    end if;
  end loop;
  return v_broj;
end;
$$;
revoke execute on function public._posalji_mejlove_probe() from public, anon, authenticated;

-- Prvo placanje (Stripe pretplata ili godisnja): mejl "Pretplata je aktivna", jednom.
create or replace function public.tg_pretplata_aktivna_mejl()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sad boolean := new.status in ('active', 'trialing')
    and (new.stripe_subscription_id is not null or new.plan = 'yearly');
  v_pre boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_pre := old.status in ('active', 'trialing')
      and (old.stripe_subscription_id is not null or old.plan = 'yearly');
  end if;
  if v_sad and not v_pre
     and not exists (select 1 from public.admin_test_accounts t where t.user_id = new.trainer_id) then
    perform public._posalji_mejl_probe(new.trainer_id, 'pretplata_aktivna');
  end if;
  return new;
exception when others then
  return new;
end;
$$;
revoke execute on function public.tg_pretplata_aktivna_mejl() from public, anon, authenticated;

drop trigger if exists pretplata_aktivna_mejl on public.trainer_subscriptions;
create trigger pretplata_aktivna_mejl
  after insert or update on public.trainer_subscriptions
  for each row execute function public.tg_pretplata_aktivna_mejl();

-- Pracenje i odjava prepoznaju i mejlove probe.
create or replace function public.mejl_dogadjaj(p_t uuid, p_vrsta text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.trainer_recovery_emails
  set opened_at = coalesce(opened_at, now()),
      open_count = least(open_count + case when p_vrsta = 'o' then 1 else 0 end, 9999),
      clicked_at = case when p_vrsta = 'k' then coalesce(clicked_at, now()) else clicked_at end,
      click_count = least(click_count + case when p_vrsta = 'k' then 1 else 0 end, 9999)
  where id = p_t and p_vrsta in ('o', 'k');
  update public.trainer_trial_emails
  set opened_at = coalesce(opened_at, now()),
      open_count = least(open_count + case when p_vrsta = 'o' then 1 else 0 end, 9999),
      clicked_at = case when p_vrsta = 'k' then coalesce(clicked_at, now()) else clicked_at end,
      click_count = least(click_count + case when p_vrsta = 'k' then 1 else 0 end, 9999)
  where id = p_t and p_vrsta in ('o', 'k');
$$;
revoke execute on function public.mejl_dogadjaj(uuid, text) from public;
grant execute on function public.mejl_dogadjaj(uuid, text) to anon, authenticated, service_role;

create or replace function public.email_odjava(p_t uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid;
begin
  select trainer_id into v_user from public.trainer_recovery_emails where id = p_t;
  if v_user is null then
    select trainer_id into v_user from public.trainer_trial_emails where id = p_t;
  end if;
  if v_user is null then
    return jsonb_build_object('ok', false);
  end if;
  insert into public.email_odjave (user_id) values (v_user) on conflict (user_id) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.email_odjava(uuid) from public;
grant execute on function public.email_odjava(uuid) to anon, authenticated, service_role;

-- Podsetnici o isteku: proba bez kartice dobija samo push (mejl salju mejlovi probe).
CREATE OR REPLACE FUNCTION public.notify_membership_expiry()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_ime text;
  v_vault text;
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

    -- Kad clanarina istekne, zna i trener (moze da je iskljuci u podesavanjima obavestenja).
    IF v_faza = 'istekla' THEN
      SELECT NULLIF(trim(p.full_name), '') INTO v_ime FROM public.profiles p WHERE p.id = r.athlete_id;
      INSERT INTO public.notifications
        (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
      VALUES (r.trainer_id, 'trainer', NULL, r.athlete_id, 'membership_expired',
              'Istekla članarina: ' || COALESCE(v_ime, 'vežbač'),
              CASE WHEN v_paket IS NOT NULL THEN 'Paket ' || v_paket || ' je istekao '
                   ELSE 'Članarina je istekla ' END
                || to_char(r.ends_on, 'DD.MM.') || ' Podseti vežbača da produži članarinu.',
              jsonb_build_object('membership_id', r.id, 'faza', 'istekla'));
      v_broj := v_broj + 1;
    END IF;
  END LOOP;

  -- 2) Trener: FitLink pretplata.
  FOR r IN
    SELECT ts.id, ts.trainer_id, ts.status::text AS status, ts.access_until,
           (ts.stripe_subscription_id IS NOT NULL AND NOT COALESCE(ts.cancel_at_period_end, false)
            AND ts.status IN ('active', 'trialing')) AS obnavlja_se,
           -- Proba bez kartice: o njoj pisu mejlovi probe (trainer-trial-email), ovde ide samo push.
           (ts.stripe_subscription_id IS NULL AND ts.status = 'trialing' AND ts.trial_ends_at IS NOT NULL) AS bez_kartice
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

    -- Uz prvi podsetnik i uz istek ide i mejl, sa linkom za placanje (u aplikaciji linka nema).
    IF v_faza IN ('dana3', 'istekla') AND NOT r.bez_kartice THEN
      BEGIN
        SELECT decrypted_secret INTO v_vault FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
        IF v_vault IS NOT NULL THEN
          PERFORM net.http_post(
            url := 'https://iyvvskywmqtudafapxdk.supabase.co/functions/v1/send-app-email',
            body := jsonb_build_object(
              'event', v_kind,
              'athlete_id', r.trainer_id,
              'days_left', v_dana,
              'subscription', jsonb_build_object('access_until', v_do, 'probni', v_proba, 'vezbaca', v_vezbaca)
            ),
            params := '{}'::jsonb,
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_vault),
            timeout_milliseconds := 5000
          );
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL; -- mejl nije presudan; push je vec upisan
      END;
    END IF;
  END LOOP;

  RETURN v_broj;
END;
$function$;

-- Raspored: na 15 minuta, isto kao mejlovi povratka.
select cron.schedule('mejlovi-probe', '*/15 * * * *', $$select public._posalji_mejlove_probe()$$);
