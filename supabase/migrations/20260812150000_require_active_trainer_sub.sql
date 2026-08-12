-- Serverska brana za trenerske funkcije.
--
-- Do sada je pretplatu proveravala SAMO aplikacija (TrainerLayout + guard po
-- akciji). To je dovoljno da korisnik ne moze slucajno da radi bez pretplate, ali
-- svako ko zaobidje klijent (direktan poziv PostgREST-a sa svojim tokenom) imao je
-- pun pristup. Ovo je ista provera na mestu koje klijent ne moze da preskoci.
--
-- Dize izuzetak umesto da vraca boolean, da pozivaoci ne moraju nista da menjaju:
-- postojeci RPC-evi samo dobiju PERFORM kao prvu naredbu (vidi sledecu migraciju).

create or replace function public.require_active_trainer_sub()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Niste prijavljeni.' using errcode = '28000';
  end if;

  -- Vezbace NE diramo: provera vazi samo za naloge sa trenerskom ulogom. Bez ovoga
  -- bi svaki deljeni RPC koji atleta zove poceo da puca.
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'trainer'
  ) then
    return;
  end if;

  if not public.trainer_has_active_fitlink_sub(auth.uid()) then
    raise exception 'Nalog nema aktivnu FitLink pretplatu.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.require_active_trainer_sub() from public;
grant execute on function public.require_active_trainer_sub() to authenticated, service_role;
