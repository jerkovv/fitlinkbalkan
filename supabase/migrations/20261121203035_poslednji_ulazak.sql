-- Admin, Poslednja aktivnost: stvarno poslednje vreme kad je korisnik bio u aplikaciji ili na webu.
-- auth.sessions se osvezava tek oko jednom na sat, pa je prikaz kasnio. Beleska ide kroz pozive
-- koje postojece aplikacije i web vec salju, a nova izdanja zovu zabelezi_ulazak pri povratku.
create table if not exists public.poslednji_ulazak (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kad timestamptz not null default now()
);
alter table public.poslednji_ulazak enable row level security;
revoke all on table public.poslednji_ulazak from public, anon, authenticated;

-- Upisuje najvise jednom u minuti. Greska ovde nikad ne sme da obori poziv koji je zove.
create or replace function public._zabelezi_ulazak()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then return; end if;
  insert into public.poslednji_ulazak (user_id, kad)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set kad = excluded.kad
    where public.poslednji_ulazak.kad < now() - interval '1 minute';
exception when others then
  return;
end;
$function$;
revoke execute on function public._zabelezi_ulazak() from public, anon, authenticated;

create or replace function public.zabelezi_ulazak()
returns void
language sql
volatile security definer
set search_path to 'public'
as $function$
  select public._zabelezi_ulazak();
$function$;
revoke execute on function public.zabelezi_ulazak() from public, anon;
grant execute on function public.zabelezi_ulazak() to authenticated;

create or replace function public.get_unread_chat_count()
returns integer
language sql
volatile security definer
set search_path to 'public'
as $function$
  select public._zabelezi_ulazak();
  SELECT count(*)::int
  FROM public.messages m
  WHERE m.read_at IS NULL
    AND m.sender_id <> auth.uid()
    AND auth.uid() IN (m.trainer_id, m.athlete_id);
$function$;

create or replace function public.get_my_referral_stats()
returns table(referrer_id uuid, referrer_name text, referred_count integer, referred_active integer)
language sql
volatile security definer
set search_path to 'public'
as $function$
  select public._zabelezi_ulazak();
  SELECT
    a.referred_by_athlete_id AS referrer_id,
    p.full_name              AS referrer_name,
    COUNT(*)::int            AS referred_count,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.athlete_id = a.id AND m.status = 'active'
      )
    )::int AS referred_active
  FROM public.athletes a
  LEFT JOIN public.profiles p ON p.id = a.referred_by_athlete_id
  WHERE a.trainer_id = auth.uid()
    AND a.referred_by_athlete_id IS NOT NULL
  GROUP BY a.referred_by_athlete_id, p.full_name
  ORDER BY referred_count DESC;
$function$;

do $do$
declare
  d text := pg_get_functiondef('public.admin_list_trainers'::regproc);
  n text;
begin
  n := replace(d,
    'greatest(u.last_sign_in_at, pr.poslednji, sat.poslednji) as poslednja_aktivnost',
    'greatest(u.last_sign_in_at, pr.poslednji, sat.poslednji, ul.kad) as poslednja_aktivnost');
  if n = d then raise exception 'admin_list_trainers: kolona nije nadjena'; end if;
  d := n;
  n := replace(d,
    'left join trainer_subscriptions ts on ts.trainer_id = tr.id',
    'left join trainer_subscriptions ts on ts.trainer_id = tr.id
      left join poslednji_ulazak ul on ul.user_id = tr.id');
  if n = d then raise exception 'admin_list_trainers: spoj nije nadjen'; end if;
  execute n;
end
$do$;
