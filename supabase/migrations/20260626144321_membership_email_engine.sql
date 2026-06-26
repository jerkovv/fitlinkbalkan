-- dedup kolona za podsetnik o isteku
alter table public.memberships
  add column if not exists expiry_reminder_sent_at timestamptz;

-- aktivacioni mejl kad clanarina postane active
create or replace function public.tg_membership_activated_email()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'net', 'vault'
as $$
declare
  v_key text;
  v_url text := 'https://iyvvskywmqtudafapxdk.supabase.co/functions/v1/send-app-email';
begin
  if new.status <> 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'active' then
    return new;
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if v_key is null then
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'event', 'membership_activated',
      'athlete_id', new.athlete_id,
      'membership', jsonb_build_object(
        'plan_name', new.plan_name,
        'ends_on', new.ends_on,
        'sessions_total', new.sessions_total,
        'price', new.price
      )
    ),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 5000
  );

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_membership_activated_email on public.memberships;
create trigger trg_membership_activated_email
  after insert or update of status on public.memberships
  for each row execute function public.tg_membership_activated_email();

-- podsetnik 3 dana pre isteka (poziva ga pg_cron)
create or replace function public.fn_send_expiry_reminders()
returns void
language plpgsql
security definer
set search_path to 'public', 'net', 'vault'
as $$
declare
  v_key text;
  v_url text := 'https://iyvvskywmqtudafapxdk.supabase.co/functions/v1/send-app-email';
  r record;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if v_key is null then
    return;
  end if;

  for r in
    select id, athlete_id, plan_name, ends_on, sessions_total, price
    from public.memberships
    where status = 'active'
      and ends_on is not null
      and ends_on >= current_date
      and ends_on <= current_date + 3
      and expiry_reminder_sent_at is null
  loop
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object(
        'event', 'membership_expiring',
        'athlete_id', r.athlete_id,
        'days_left', (r.ends_on - current_date),
        'membership', jsonb_build_object(
          'plan_name', r.plan_name,
          'ends_on', r.ends_on,
          'sessions_total', r.sessions_total,
          'price', r.price
        )
      ),
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      timeout_milliseconds := 5000
    );

    update public.memberships
    set expiry_reminder_sent_at = now()
    where id = r.id;
  end loop;
end;
$$;
