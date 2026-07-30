-- Kaci trenera na vezbaca u trenutku pravljenja naloga, na osnovu
-- invite_code iz raw_user_meta_data. Radi bez sesije, pa popravlja
-- registraciju gde signUp ne vrati sesiju zbog potvrde mejla.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _role public.app_role;
  v_code text;
  v_trainer uuid := null;
  v_invite_id uuid := null;
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));

  _role := coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'athlete');
  insert into public.user_roles (user_id, role) values (new.id, _role);

  if _role = 'trainer' then
    insert into public.trainers (id, invite_code)
      values (new.id, lpad((floor(random()*100000))::text, 5, '0'));
    return new;
  end if;

  v_code := nullif(btrim(coalesce(new.raw_user_meta_data->>'invite_code', '')), '');

  if v_code is not null then
    begin
      select i.id, i.trainer_id
        into v_invite_id, v_trainer
      from public.invites i
      where lower(i.code) = lower(v_code)
        and i.status = 'pending'
        and (i.expires_at is null or i.expires_at > now())
      order by i.created_at desc
      limit 1;

      if v_trainer is null then
        select t.id
          into v_trainer
        from public.trainers t
        where t.invite_code = v_code
        limit 1;
      end if;
    exception when others then
      v_trainer := null;
      v_invite_id := null;
    end;
  end if;

  insert into public.athletes (id, trainer_id) values (new.id, v_trainer);

  if v_invite_id is not null then
    update public.invites
       set status = 'accepted',
           used_by = new.id
     where id = v_invite_id;
  end if;

  return new;
end $function$;
