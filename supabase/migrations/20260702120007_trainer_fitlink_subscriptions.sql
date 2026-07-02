-- Trenerova FitLink pretplata (SaaS placanje), ODVOJENO od atleta-trener clanarina.
-- Mesecno = Stripe subscription (recurring 49 EUR) + 30 dana trial; Godisnje = jednokratno
-- (349 EUR, 365 dana pristupa, bez obnavljanja). Webhook (service_role) puni ovu tabelu;
-- app/web SAMO citaju status. access_until je jedino polje po kome app zakljucava funkcije.

create type public.trainer_sub_plan as enum ('monthly', 'yearly');
create type public.trainer_sub_status as enum ('trialing', 'active', 'past_due', 'canceled', 'expired', 'incomplete');

create table public.trainer_subscriptions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan public.trainer_sub_plan,
  status public.trainer_sub_status not null default 'incomplete',
  access_until timestamptz,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_payment_at timestamptz,
  amount_cents integer,
  currency text not null default 'eur',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_trainer_subscriptions_access on public.trainer_subscriptions (status, access_until);

-- updated_at auto (unikatno ime funkcije da ne pregazi eventualni deljeni trigger)
create or replace function public.tg_trainer_subscriptions_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger trg_trainer_subscriptions_updated_at
before update on public.trainer_subscriptions
for each row execute function public.tg_trainer_subscriptions_updated_at();

-- RLS: trener vidi SVOJ red; upis samo service_role (webhook) koji zaobilazi RLS
alter table public.trainer_subscriptions enable row level security;
create policy trainer_sub_select_own on public.trainer_subscriptions
  for select using (trainer_id = auth.uid());

-- Webhook idempotencija (dedup Stripe eventi); zakljucano na service_role (bez policy-ja)
create table public.stripe_events (
  id text primary key,
  type text,
  received_at timestamptz not null default now(),
  payload jsonb
);
alter table public.stripe_events enable row level security;

-- Helper za zakljucavanje trenerskih funkcija
create or replace function public.trainer_has_active_fitlink_sub(p_trainer_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.trainer_subscriptions ts
    where ts.trainer_id = p_trainer_id
      and ts.status in ('trialing', 'active', 'past_due')
      and ts.access_until is not null
      and ts.access_until > now()
  );
$$;
revoke all on function public.trainer_has_active_fitlink_sub(uuid) from public;
grant execute on function public.trainer_has_active_fitlink_sub(uuid) to authenticated, service_role;
