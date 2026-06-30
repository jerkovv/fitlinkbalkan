-- Invarijanta: jedan sportista -> najvise jedan aktivan (objavljen) program.
-- Kad program postane objavljen (published_at se postavi), postaje aktivan
-- program sportiste, a svi ostali programi tog sportiste se gase.

create or replace function public._enforce_single_active_program()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Ugasi sve druge programe ovog sportiste.
  update public.assigned_programs
  set is_active = false
  where athlete_id = new.athlete_id
    and id <> new.id
    and is_active = true;

  -- Osiguraj da je upravo objavljeni program aktivan
  -- (pokriva slucaj kad je bio is_active=false, npr. posle ciscenja).
  if new.is_active is distinct from true then
    update public.assigned_programs set is_active = true where id = new.id;
  end if;

  return null;
end;
$function$;

drop trigger if exists trg_single_active_program on public.assigned_programs;

create trigger trg_single_active_program
after insert or update of published_at on public.assigned_programs
for each row
when (new.published_at is not null)
execute function public._enforce_single_active_program();
