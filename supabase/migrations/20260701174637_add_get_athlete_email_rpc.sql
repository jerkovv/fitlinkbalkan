-- Trener moze da vidi email svog klijenta. Vraca email samo ako je pozivalac
-- (auth.uid()) trener tog klijenta; inace nema reda -> null.
create or replace function public.get_athlete_email(p_athlete_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select u.email::text
  from auth.users u
  where u.id = p_athlete_id
    and exists (
      select 1 from public.athletes a
      where a.id = p_athlete_id and a.trainer_id = auth.uid()
    );
$$;

revoke all on function public.get_athlete_email(uuid) from public, anon;
grant execute on function public.get_athlete_email(uuid) to authenticated;
