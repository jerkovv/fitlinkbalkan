-- Mejlovi povratka: trener je potvrdio nalog a nije pokrenuo pretplatu.
--   korak 1: 3 sata posle potvrde naloga (isti dan)
--   korak 2: 3 dana posle potvrde, samo ako je korak 1 otisao (poslednji podsetnik)
-- Salje ih edge funkcija trainer-recovery-email; ovde su dnevnik slanja, odjava, pracenje
-- otvaranja i klika (fitlink.rs/api/mejl) i pregled za admin.fitlink.rs.
-- Raspored (pg_cron) se ukljucuje posebno, kad su strana za odjavu i /api/mejl zivi.

create table if not exists public.trainer_recovery_emails (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  korak smallint not null check (korak in (1, 2)),
  resend_id text,
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  open_count integer not null default 0,
  clicked_at timestamptz,
  click_count integer not null default 0,
  greska text,
  unique (trainer_id, korak)
);

create table if not exists public.email_odjave (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Bez politika: citaju i pisu samo service_role i funkcije ispod.
alter table public.trainer_recovery_emails enable row level security;
alter table public.email_odjave enable row level security;
revoke all on table public.trainer_recovery_emails from anon, authenticated;
revoke all on table public.email_odjave from anon, authenticated;

-- Raspored: zove ga pg_cron. Salje samo izmedju 9 i 21 po Beogradu.
create or replace function public._posalji_mejlove_povratka()
returns integer
language plpgsql
security definer
set search_path to 'public', 'net', 'vault'
as $$
declare
  v_sat int := extract(hour from (now() at time zone 'Europe/Belgrade'))::int;
  v_key text;
  v_id uuid;
  v_broj int := 0;
  r record;
begin
  if v_sat < 9 or v_sat >= 21 then
    return 0;
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;
  if v_key is null then
    return 0;
  end if;

  for r in
    select u.id, k.korak
    from auth.users u
    join public.user_roles ur on ur.user_id = u.id and ur.role = 'trainer'
    cross join (values (1), (2)) as k(korak)
    where u.email_confirmed_at is not null
      -- nikad nije pokrenuo ni probu ni pretplatu (red "incomplete" bez pristupa se ne racuna)
      and not exists (
        select 1 from public.trainer_subscriptions ts
        where ts.trainer_id = u.id
          and (ts.access_until is not null or ts.stripe_subscription_id is not null)
      )
      and not exists (select 1 from public.email_odjave o where o.user_id = u.id)
      and not exists (select 1 from public.admin_test_accounts t where t.user_id = u.id)
      and not exists (
        select 1 from public.trainer_recovery_emails e where e.trainer_id = u.id and e.korak = k.korak
      )
      and (
        (k.korak = 1
          and u.email_confirmed_at <= now() - interval '3 hours'
          and u.email_confirmed_at > now() - interval '36 hours')
        or
        (k.korak = 2
          and u.email_confirmed_at <= now() - interval '3 days'
          and u.email_confirmed_at > now() - interval '7 days'
          and exists (
            select 1 from public.trainer_recovery_emails e1
            where e1.trainer_id = u.id and e1.korak = 1 and e1.sent_at <= now() - interval '2 days'
          ))
      )
  loop
    v_id := null;
    insert into public.trainer_recovery_emails (trainer_id, korak)
    values (r.id, r.korak)
    on conflict (trainer_id, korak) do nothing
    returning id into v_id;
    continue when v_id is null;

    perform net.http_post(
      url := 'https://iyvvskywmqtudafapxdk.supabase.co/functions/v1/trainer-recovery-email',
      body := jsonb_build_object('step', r.korak, 'trainer_id', r.id, 'log_id', v_id),
      params := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      timeout_milliseconds := 10000
    );
    v_broj := v_broj + 1;
  end loop;

  return v_broj;
end;
$$;

revoke execute on function public._posalji_mejlove_povratka() from public, anon, authenticated;

-- Otvaranje ('o') i klik ('k') iz mejla. Zove ga fitlink.rs/api/mejl sa javnim kljucem;
-- kljuc reda je nasumican uuid iz samog mejla, pa niko drugi ne moze da ga pogodi.
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
$$;

revoke execute on function public.mejl_dogadjaj(uuid, text) from public;
grant execute on function public.mejl_dogadjaj(uuid, text) to anon, authenticated, service_role;

-- Odjava od podsetnika, sa strane fitlink.rs/odjava?t=<kljuc iz mejla>.
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
    return jsonb_build_object('ok', false);
  end if;
  insert into public.email_odjave (user_id) values (v_user) on conflict (user_id) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.email_odjava(uuid) from public;
grant execute on function public.email_odjava(uuid) to anon, authenticated, service_role;

-- Pregled za admin.fitlink.rs: jedan red po treneru koji je dobio bar jedan mejl.
-- "pokrenuo" znaci da sada ima probu ili pretplatu; u trenutku slanja je nije imao,
-- pa je sve sto postoji nastalo posle mejla. "platio" je prva naplata.
create or replace function public.admin_recovery_emails()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.poslednji desc), '[]'::jsonb)
    from (
      select e.trainer_id,
             p.full_name,
             u.email,
             u.email_confirmed_at as potvrdio_at,
             max(e.sent_at) as poslednji,
             max(e.sent_at) filter (where e.korak = 1) as m1_poslat,
             max(e.opened_at) filter (where e.korak = 1) as m1_otvoren,
             max(e.clicked_at) filter (where e.korak = 1) as m1_klik,
             bool_or(e.resend_id is null) filter (where e.korak = 1) as m1_bez_potvrde,
             max(e.greska) filter (where e.korak = 1) as m1_greska,
             max(e.sent_at) filter (where e.korak = 2) as m2_poslat,
             max(e.opened_at) filter (where e.korak = 2) as m2_otvoren,
             max(e.clicked_at) filter (where e.korak = 2) as m2_klik,
             bool_or(e.resend_id is null) filter (where e.korak = 2) as m2_bez_potvrde,
             max(e.greska) filter (where e.korak = 2) as m2_greska,
             exists (select 1 from public.email_odjave o where o.user_id = e.trainer_id) as odjavljen,
             ts.status::text as status,
             coalesce(ts.access_until is not null or ts.stripe_subscription_id is not null, false) as pokrenuo,
             ts.trial_ends_at,
             ts.access_until,
             ts.last_payment_at,
             (ts.last_payment_at is not null) as platio,
             exists (select 1 from public.admin_test_accounts a where a.user_id = e.trainer_id) as test_nalog
      from public.trainer_recovery_emails e
      left join auth.users u on u.id = e.trainer_id
      left join public.profiles p on p.id = e.trainer_id
      left join public.trainer_subscriptions ts on ts.trainer_id = e.trainer_id
      group by e.trainer_id, p.full_name, u.email, u.email_confirmed_at,
               ts.status, ts.access_until, ts.stripe_subscription_id, ts.trial_ends_at, ts.last_payment_at
    ) t
  );
end;
$$;

revoke execute on function public.admin_recovery_emails() from public, anon;
grant execute on function public.admin_recovery_emails() to authenticated, service_role;

-- Raspored: na svakih 15 minuta. Ukljucen 2026-11-19, kad su fitlink.rs/odjava i /api/mejl postali zivi.
select cron.schedule('mejlovi-povratka-trenera', '*/15 * * * *', 'select public._posalji_mejlove_povratka();');
