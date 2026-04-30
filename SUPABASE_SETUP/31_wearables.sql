-- =====================================================================
-- 31_wearables.sql
-- Wearable integracije (Apple Health, Health Connect, Fitbit, Garmin,
-- Strava, Polar, Whoop, Google Fit)
-- =====================================================================

-- ---------- 1. Tabele -------------------------------------------------

create table if not exists public.wearable_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in (
    'apple_health','health_connect','fitbit','google_fit',
    'garmin','strava','polar','whoop'
  )),
  status text not null default 'connected' check (status in ('connected','revoked','error')),
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  external_user_id text,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists idx_wearable_connections_user
  on public.wearable_connections(user_id);

create table if not exists public.wearable_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in (
    'apple_health','health_connect','fitbit','google_fit',
    'garmin','strava','polar','whoop','manual'
  )),
  data_type text not null check (data_type in (
    'heart_rate_resting','heart_rate_avg','heart_rate_max',
    'hrv','steps','calories_active','calories_total',
    'sleep_minutes','sleep_deep_minutes','sleep_rem_minutes',
    'recovery_score','readiness_score','vo2_max',
    'workout_duration','distance_meters','spo2','body_temp'
  )),
  value numeric not null,
  unit text,
  recorded_for date not null,
  recorded_at timestamptz not null default now(),
  source_id text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, provider, data_type, recorded_for, source_id)
);

create index if not exists idx_wearable_data_lookup
  on public.wearable_data(user_id, data_type, recorded_for desc);

create table if not exists public.wearable_sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null check (status in ('success','partial','error')),
  records_synced integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_wearable_sync_logs_user
  on public.wearable_sync_logs(user_id, started_at desc);

-- ---------- 2. updated_at trigger ------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_wearable_connections_updated on public.wearable_connections;
create trigger trg_wearable_connections_updated
  before update on public.wearable_connections
  for each row execute function public.set_updated_at();

-- ---------- 3. RLS ----------------------------------------------------

alter table public.wearable_connections enable row level security;
alter table public.wearable_data        enable row level security;
alter table public.wearable_sync_logs   enable row level security;

-- Helper: trener vidi vežbačeve podatke ako je vežbač u njegovoj listi
create or replace function public.is_my_athlete(_trainer uuid, _athlete uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.athletes
    where id = _athlete and trainer_id = _trainer
  )
$$;

-- wearable_connections
drop policy if exists "wc_select_self" on public.wearable_connections;
create policy "wc_select_self" on public.wearable_connections
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_my_athlete(auth.uid(), user_id)
  );

drop policy if exists "wc_insert_self" on public.wearable_connections;
create policy "wc_insert_self" on public.wearable_connections
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "wc_update_self" on public.wearable_connections;
create policy "wc_update_self" on public.wearable_connections
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "wc_delete_self" on public.wearable_connections;
create policy "wc_delete_self" on public.wearable_connections
  for delete to authenticated
  using (user_id = auth.uid());

-- wearable_data
drop policy if exists "wd_select" on public.wearable_data;
create policy "wd_select" on public.wearable_data
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_my_athlete(auth.uid(), user_id)
  );

drop policy if exists "wd_insert_self" on public.wearable_data;
create policy "wd_insert_self" on public.wearable_data
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "wd_delete_self" on public.wearable_data;
create policy "wd_delete_self" on public.wearable_data
  for delete to authenticated
  using (user_id = auth.uid());

-- wearable_sync_logs
drop policy if exists "ws_select" on public.wearable_sync_logs;
create policy "ws_select" on public.wearable_sync_logs
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_my_athlete(auth.uid(), user_id)
  );

drop policy if exists "ws_insert_self" on public.wearable_sync_logs;
create policy "ws_insert_self" on public.wearable_sync_logs
  for insert to authenticated
  with check (user_id = auth.uid());

-- ---------- 4. RPC: get_latest_wearable_metrics ----------------------

create or replace function public.get_latest_wearable_metrics(p_user_id uuid)
returns table (
  data_type text,
  value numeric,
  unit text,
  recorded_for date,
  recorded_at timestamptz,
  provider text,
  prev_value numeric
)
language sql stable security definer set search_path = public
as $$
  with latest as (
    select distinct on (data_type)
      data_type, value, unit, recorded_for, recorded_at, provider
    from public.wearable_data
    where user_id = p_user_id
      and (
        p_user_id = auth.uid()
        or public.is_my_athlete(auth.uid(), p_user_id)
      )
    order by data_type, recorded_for desc, recorded_at desc
  ),
  prev as (
    select distinct on (wd.data_type)
      wd.data_type, wd.value as prev_value
    from public.wearable_data wd
    join latest l on l.data_type = wd.data_type
    where wd.user_id = p_user_id
      and wd.recorded_for < l.recorded_for
    order by wd.data_type, wd.recorded_for desc, wd.recorded_at desc
  )
  select l.data_type, l.value, l.unit, l.recorded_for,
         l.recorded_at, l.provider, p.prev_value
  from latest l
  left join prev p using (data_type);
$$;

grant execute on function public.get_latest_wearable_metrics(uuid) to authenticated;
