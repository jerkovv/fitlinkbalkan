-- Cenovnik trenerske pretplate - izvor istine za iznose. Checkout cita ovo i kreira Stripe
-- sesiju sa inline price_data pri kupovini (bez fiksnih price ID-eva). Dejan menja cene OVDE.
-- Samo NE-tajni podaci; Stripe secret key ostaje u Edge Function env-u, NIKAD u bazi.
-- Zakljucano na service_role (Edge Function); app/web ne citaju direktno (i zbog Apple usaglasenosti).

create table public.billing_plans (
  plan public.trainer_sub_plan primary key,   -- 'monthly' | 'yearly'
  stripe_product_id text,                      -- postojeci prod_ id (za uredne Stripe izvestaje)
  amount_cents integer not null,               -- 4900 = 49.00 EUR, 34900 = 349.00 EUR
  currency text not null default 'eur',
  interval text,                               -- 'month' za mesecnu subscription; null za jednokratni godisnji
  trial_days integer not null default 0,       -- 30 za mesecnu; 0 za godisnji
  display_name text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.billing_plans (plan, stripe_product_id, amount_cents, currency, interval, trial_days, display_name)
values
  ('monthly', 'prod_UoMBmqmmNQxUvM', 4900,  'eur', 'month', 30, 'FitLink Trener - Mesecno'),
  ('yearly',  'prod_UoMBIRuP9HGXX7', 34900, 'eur', null,    0,  'FitLink Trener - Godisnje');

alter table public.billing_plans enable row level security;
-- bez policy-ja: samo service_role (Edge Function) cita/pise
