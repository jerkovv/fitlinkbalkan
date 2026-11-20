-- Admin podesavanja i mejl adminu kad se registruje novi trener (2026-11-20).
--   * admin_podesavanja: kljuc -> vrednost (jsonb). Prvo podesavanje "novi_trener_mejl":
--     {"ukljuceno": true, "adresa": "..."}; podrazumevano ukljuceno. Adresa se ne pise u repo,
--     upisuje se iz admina (admin_set_podesavanje).
--   * okidac na trainers (red nastaje u handle_new_user cim se nalog napravi): ako je ukljuceno i
--     ima adresu, send-app-email salje "admin_novi_trener" na tu adresu. Greska nikad ne sme da
--     zaustavi registraciju.

create table if not exists public.admin_podesavanja (
  kljuc text primary key,
  vrednost jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.admin_podesavanja enable row level security;
revoke all on table public.admin_podesavanja from anon, authenticated;

insert into public.admin_podesavanja (kljuc, vrednost)
values ('novi_trener_mejl', '{"ukljuceno": true, "adresa": null}'::jsonb)
on conflict (kljuc) do nothing;

create or replace function public.admin_get_podesavanja()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return (select coalesce(jsonb_object_agg(kljuc, vrednost), '{}'::jsonb) from public.admin_podesavanja);
end;
$$;
revoke execute on function public.admin_get_podesavanja() from public, anon;
grant execute on function public.admin_get_podesavanja() to authenticated;

create or replace function public.admin_set_podesavanje(p_kljuc text, p_vrednost jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_kljuc not in ('novi_trener_mejl') then raise exception 'nepoznato podesavanje'; end if;
  insert into public.admin_podesavanja (kljuc, vrednost, updated_at)
  values (p_kljuc, coalesce(p_vrednost, '{}'::jsonb), now())
  on conflict (kljuc) do update set vrednost = excluded.vrednost, updated_at = now();
  return public.admin_get_podesavanja();
end;
$$;
revoke execute on function public.admin_set_podesavanje(text, jsonb) from public, anon;
grant execute on function public.admin_set_podesavanje(text, jsonb) to authenticated;

create or replace function public.tg_admin_mejl_novi_trener()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'net', 'vault'
as $$
declare
  v_p jsonb;
  v_adresa text;
  v_key text;
begin
  select vrednost into v_p from public.admin_podesavanja where kljuc = 'novi_trener_mejl';
  if v_p is null or coalesce((v_p->>'ukljuceno')::boolean, true) = false then
    return new;
  end if;
  v_adresa := nullif(btrim(coalesce(v_p->>'adresa', '')), '');
  if v_adresa is null then
    return new;
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_key is null then
    return new;
  end if;
  perform net.http_post(
    url := 'https://iyvvskywmqtudafapxdk.supabase.co/functions/v1/send-app-email',
    body := jsonb_build_object('event', 'admin_novi_trener', 'athlete_id', new.id, 'to', v_adresa),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  return new;
end;
$$;
revoke execute on function public.tg_admin_mejl_novi_trener() from public, anon, authenticated;

drop trigger if exists admin_mejl_novi_trener on public.trainers;
create trigger admin_mejl_novi_trener
  after insert on public.trainers
  for each row execute function public.tg_admin_mejl_novi_trener();

-- Dnevnik mejlova: citljiv naziv za mejl adminu.
do $$
declare
  v_src text;
  v_def text;
begin
  select pg_get_functiondef('public.admin_email_log(integer)'::regprocedure) into v_def;
  if position('admin_novi_trener' in v_def) = 0 then
    v_def := replace(v_def,
      $a$when 'trainer_billing_intro' then 'Pokreni pretplatu (staro)'$a$,
      $a$when 'trainer_billing_intro' then 'Pokreni pretplatu (staro)'
                 when 'admin_novi_trener' then 'Admin: novi trener'$a$);
    execute v_def;
  end if;
end $$;
