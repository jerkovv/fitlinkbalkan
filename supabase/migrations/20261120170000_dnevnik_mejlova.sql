-- Dnevnik svih mejlova za admin (2026-11-20).
--   * app_email_log: svaki mejl iz send-app-email (clanarina, pretplata, stari "pokreni pretplatu"),
--     sa istom slikom 1x1 za otvaranje kao mejlovi probe i povratka (fitlink.rs/api/mejl?o=<id>)
--   * mejl_dogadjaj belezi otvaranje i klik i u ovoj tabeli
--   * admin_email_log: jedan spisak iz app_email_log, trainer_trial_emails, trainer_recovery_emails
--     i invites (pozivnica vezbacu ide preko Supabase Auth, pa se vidi samo da je poslata i prihvacena)

create table if not exists public.app_email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  event text not null,
  subject text,
  resend_id text,
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  open_count integer not null default 0,
  clicked_at timestamptz,
  click_count integer not null default 0,
  greska text
);
create index if not exists app_email_log_sent_at on public.app_email_log (sent_at desc);
alter table public.app_email_log enable row level security;
revoke all on table public.app_email_log from anon, authenticated;

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
  update public.app_email_log
  set opened_at = coalesce(opened_at, now()),
      open_count = least(open_count + case when p_vrsta = 'o' then 1 else 0 end, 9999),
      clicked_at = case when p_vrsta = 'k' then coalesce(clicked_at, now()) else clicked_at end,
      click_count = least(click_count + case when p_vrsta = 'k' then 1 else 0 end, 9999)
  where id = p_t and p_vrsta in ('o', 'k');
$$;
revoke execute on function public.mejl_dogadjaj(uuid, text) from public;
grant execute on function public.mejl_dogadjaj(uuid, text) to anon, authenticated, service_role;

create or replace function public.admin_email_log(p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(m) order by m.poslato desc), '[]'::jsonb)
    from (
      select * from (
        select a.id, 'aplikacija'::text as izvor, a.event as vrsta,
               case a.event
                 when 'membership_activated' then 'Članarina aktivna'
                 when 'membership_expiring' then 'Članarina ističe'
                 when 'fitlink_sub_expiring' then 'Pretplata ističe'
                 when 'fitlink_sub_expired' then 'Pretplata istekla'
                 when 'trainer_billing_intro' then 'Pokreni pretplatu (staro)'
                 else a.event end as naziv,
               a.user_id as primalac, coalesce(a.email, u.email) as email,
               a.sent_at as poslato, (a.resend_id is not null and a.greska is null) as uspeh, a.greska,
               a.opened_at, a.open_count, a.clicked_at, a.click_count, true as meri_otvaranje
        from public.app_email_log a
        left join auth.users u on u.id = a.user_id
        union all
        select e.id, 'proba', e.korak,
               case e.korak
                 when 'dobrodoslica' then 'Proba: dobrodošlica'
                 when 'proba7' then 'Proba: još 7 dana'
                 when 'proba3' then 'Proba: ističe za 3 dana'
                 when 'proba_danas' then 'Proba: ističe danas'
                 when 'proba_istekla' then 'Proba: istekla'
                 when 'pretplata_aktivna' then 'Pretplata aktivna'
                 else e.korak end,
               e.trainer_id, u.email, e.sent_at, (e.resend_id is not null and e.greska is null), e.greska,
               e.opened_at, e.open_count, e.clicked_at, e.click_count, true
        from public.trainer_trial_emails e
        left join auth.users u on u.id = e.trainer_id
        union all
        select r.id, 'povratak', 'povratak' || r.korak::text,
               case r.korak when 1 then 'Povratak: nalog čeka' else 'Povratak: poslednji podsetnik' end,
               r.trainer_id, u.email, r.sent_at, (r.resend_id is not null and r.greska is null), r.greska,
               r.opened_at, r.open_count, r.clicked_at, r.click_count, true
        from public.trainer_recovery_emails r
        left join auth.users u on u.id = r.trainer_id
        union all
        select i.id, 'pozivnica', 'pozivnica',
               case when i.status = 'accepted' then 'Pozivnica vežbaču (prihvaćena)' else 'Pozivnica vežbaču' end,
               i.used_by, i.email, i.sent_at, true, null::text,
               null::timestamptz, 0, null::timestamptz, 0, false
        from public.invites i
        where i.sent_at is not null
      ) x
      order by x.poslato desc
      limit greatest(1, least(coalesce(p_limit, 1000), 5000))
    ) m0
    cross join lateral (
      select m0.*,
             p.full_name as ime,
             (select ur.role::text from public.user_roles ur where ur.user_id = m0.primalac limit 1) as uloga,
             exists (select 1 from public.email_odjave o where o.user_id = m0.primalac) as odjavljen,
             exists (select 1 from public.admin_test_accounts t where t.user_id = m0.primalac) as test
      from (select 1) _
      left join public.profiles p on p.id = m0.primalac
    ) m
  );
end
$$;
revoke execute on function public.admin_email_log(integer) from public, anon;
grant execute on function public.admin_email_log(integer) to authenticated;
