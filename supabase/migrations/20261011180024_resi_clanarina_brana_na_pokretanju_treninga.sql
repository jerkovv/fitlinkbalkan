-- Brana clanarine na serveru za pokretanje treninga.
-- Do sada je clanarinu proveravao samo telefon (get_my_membership_access), pa je vezbac
-- sa isteklom clanarinom ili trenerom bez pretplate mogao da pokrene trening sa sata
-- (watch_start_workout, watch_start_free_workout) ili direktnim pozivom.
-- Provera ide kao okidac na workout_session_logs, a ne u _start_* funkcije, da vazi za
-- svaki put kojim nastaje trening u toku (telefon, sat, veb, direktan upis kroz RLS) i
-- da se ne sudara sa izmenama tih funkcija.
-- Trening koji vec traje se ne dira: nastavak ne pravi nov red. Trenerov naknadni unos
-- (trainer_create_past_workout) upisuje zavrsen trening sa is_active = false, pa prolazi.

-- Jedna istina o pristupu, za bilo kog vezbaca. Telo je isto kao dosadasnji
-- get_my_membership_access, samo sto vezbac stize kao parametar (sat nema auth.uid()).
CREATE OR REPLACE FUNCTION public._membership_access(p_athlete_id uuid)
 RETURNS TABLE(has_access boolean, state text, ends_on date, trainer_id uuid, trainer_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := p_athlete_id;
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

REVOKE EXECUTE ON FUNCTION public._membership_access(uuid) FROM PUBLIC, anon, authenticated;

-- Isti potpis i isti kljucevi kao do sada (citaju ga veb i nativna aplikacija),
-- samo sto racun vise ne zivi na dva mesta.
CREATE OR REPLACE FUNCTION public.get_my_membership_access()
 RETURNS TABLE(has_access boolean, state text, ends_on date, trainer_id uuid, trainer_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query select * from public._membership_access(auth.uid());
end;
$function$;

-- Okidac: nov trening u toku ne moze da nastane za vezbaca bez pristupa.
CREATE OR REPLACE FUNCTION public._brana_clanarine_trening()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ima boolean;
  v_stanje text;
begin
  select a.has_access, a.state into v_ima, v_stanje
  from public._membership_access(NEW.athlete_id) a;

  if coalesce(v_ima, false) then
    return NEW;
  end if;

  -- Poruka ide pravo na ekran (telefon je cita iz greske, sat iz polja error).
  if v_stanje = 'trainer_inactive' then
    raise exception 'Trener trenutno nema aktivnu pretplatu. Javi mu se da nastavite.'
      using errcode = 'P0001';
  end if;
  raise exception 'Nemaš aktivnu članarinu. Obnovi je kod trenera da nastaviš sa treninzima.'
    using errcode = 'P0001';
end;
$function$;

REVOKE EXECUTE ON FUNCTION public._brana_clanarine_trening() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_brana_clanarine_trening ON public.workout_session_logs;
CREATE TRIGGER trg_brana_clanarine_trening
  BEFORE INSERT ON public.workout_session_logs
  FOR EACH ROW
  WHEN (NEW.is_active IS TRUE AND NEW.completed_at IS NULL)
  EXECUTE FUNCTION public._brana_clanarine_trening();
