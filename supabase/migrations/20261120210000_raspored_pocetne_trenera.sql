-- Raspored pocetne trenera (2026-11-20): koji delovi se vide i kojim redom, na nalogu,
-- da vazi na svakom telefonu (iOS i Android). Pristup samo kroz dve funkcije.

create table if not exists public.trener_raspored_pocetne (
  trainer_id uuid primary key references auth.users(id) on delete cascade,
  raspored jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.trener_raspored_pocetne enable row level security;
revoke all on table public.trener_raspored_pocetne from anon, authenticated;

-- {"redosled": ["uplate", ...], "sakriveno": ["danas", ...]} ili null kad trener nista nije menjao.
create or replace function public.trener_raspored_pocetne_get()
returns jsonb
language sql
security definer
set search_path to 'public'
stable
as $$
  select raspored from public.trener_raspored_pocetne where trainer_id = auth.uid();
$$;
revoke execute on function public.trener_raspored_pocetne_get() from public, anon;
grant execute on function public.trener_raspored_pocetne_get() to authenticated;

create or replace function public.trener_raspored_pocetne_set(p_raspored jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.trainers where id = auth.uid()) then raise exception 'Samo trener'; end if;
  if p_raspored is null or jsonb_typeof(p_raspored) <> 'object' or length(p_raspored::text) > 4000 then
    raise exception 'Neispravan raspored';
  end if;
  insert into public.trener_raspored_pocetne (trainer_id, raspored, updated_at)
  values (auth.uid(), p_raspored, now())
  on conflict (trainer_id) do update set raspored = excluded.raspored, updated_at = now();
end;
$$;
revoke execute on function public.trener_raspored_pocetne_set(jsonb) from public, anon;
grant execute on function public.trener_raspored_pocetne_set(jsonb) to authenticated;
