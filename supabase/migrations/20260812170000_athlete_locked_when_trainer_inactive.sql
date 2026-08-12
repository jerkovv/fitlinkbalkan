-- Vezbac se zakljucava i kad NJEGOV TRENER nema aktivnu FitLink pretplatu.
--
-- Trener koji ne placa ne moze da vodi klijente, pa vezbac dobija isti lock koji
-- vec postoji za isteklu clanarinu - ali sa tacnim razlogom ('trainer_inactive'),
-- da mu poruka ne bi pogresno rekla da nema clanarinu kad je uredno platio.
--
-- Provera ide PRE clanarine i potpis (RETURNS TABLE) ostaje nepromenjen - menja se
-- samo telo funkcije.
create or replace function public.get_my_membership_access()
returns table(has_access boolean, state text, ends_on date, trainer_id uuid, trainer_name text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_active public.memberships%rowtype;
  v_recent public.memberships%rowtype;
  v_trainer_id uuid;
  v_trainer_name text;
begin
  if v_uid is null then
    return query select false, 'none'::text, null::date, null::uuid, null::text;
    return;
  end if;

  -- trenutni trener vezbaca
  select a.trainer_id into v_trainer_id
  from public.athletes a
  where a.id = v_uid;

  if v_trainer_id is not null then
    select p.full_name into v_trainer_name
    from public.profiles p
    where p.id = v_trainer_id;

    -- Trener bez aktivne pretplate -> vezbac zakljucan, bez obzira na clanarinu.
    if not public.trainer_has_active_fitlink_sub(v_trainer_id) then
      return query select false, 'trainer_inactive'::text, null::date, v_trainer_id, v_trainer_name;
      return;
    end if;
  end if;

  -- aktivna, jos uvek vazeca clanarina
  select m.* into v_active
  from public.memberships m
  where m.athlete_id = v_uid
    and m.status = 'active'
    and (m.ends_on is null or m.ends_on >= current_date)
  order by m.ends_on desc nulls first
  limit 1;

  if found then
    return query select true, 'active'::text, v_active.ends_on, v_trainer_id, v_trainer_name;
    return;
  end if;

  -- nema pristup: poruku odredjuje poslednja clanarina
  select m.* into v_recent
  from public.memberships m
  where m.athlete_id = v_uid
  order by m.starts_on desc, m.created_at desc
  limit 1;

  if not found then
    return query select false, 'none'::text, null::date, v_trainer_id, v_trainer_name;
    return;
  end if;

  return query select
    false,
    case
      when v_recent.status = 'paused' then 'paused'
      when v_recent.status = 'cancelled' then 'cancelled'
      else 'expired'
    end::text,
    v_recent.ends_on,
    v_trainer_id,
    v_trainer_name;
end;
$function$;
