-- Replace the em dash in the waitlist_promoted notification body with a period (house style: no em/en dashes).
create or replace function public._promote_waitlist(p_trainer_id uuid, p_date date, p_start_time time without time zone, p_session_type_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_type    public.session_types%rowtype;
  v_booked  int;
  v_w       public.session_waitlist%rowtype;
  v_mem     public.memberships%rowtype;
  v_booking_id uuid;
  v_slot_at timestamptz;
begin
  perform pg_advisory_xact_lock(
    hashtext(p_trainer_id::text || p_date::text || p_start_time::text || p_session_type_id::text)
  );

  select * into v_type from public.session_types where id = p_session_type_id;
  if not found then return; end if;

  v_slot_at := (p_date::timestamp + p_start_time)::timestamptz;
  if v_slot_at <= now() then return; end if;

  loop
    select count(*) into v_booked
      from public.session_bookings
     where trainer_id = p_trainer_id and date = p_date and start_time = p_start_time
       and session_type_id = p_session_type_id and status = 'booked';
    exit when v_booked >= v_type.capacity;

    select * into v_w
      from public.session_waitlist
     where trainer_id = p_trainer_id and date = p_date and start_time = p_start_time
       and session_type_id = p_session_type_id and status = 'waiting'
     order by created_at, id
     for update skip locked
     limit 1;
    exit when not found;

    if exists (
      select 1 from public.session_bookings
       where trainer_id = p_trainer_id and date = p_date and start_time = p_start_time
         and session_type_id = p_session_type_id and athlete_id = v_w.athlete_id and status = 'booked'
    ) then
      update public.session_waitlist set status = 'cancelled' where id = v_w.id;
      continue;
    end if;

    select * into v_mem
      from public.memberships
     where athlete_id = v_w.athlete_id and trainer_id = p_trainer_id and status = 'active'
       and (ends_on is null or ends_on >= p_date)
     order by ends_on desc nulls last
     limit 1;

    if not found
       or (v_mem.sessions_total is not null and v_mem.sessions_used >= v_mem.sessions_total) then
      update public.session_waitlist set status = 'cancelled' where id = v_w.id;
      continue;
    end if;

    insert into public.session_bookings (
      trainer_id, athlete_id, date, start_time, session_type_id,
      type_name, type_color, duration_min, capacity, status
    ) values (
      p_trainer_id, v_w.athlete_id, p_date, p_start_time, p_session_type_id,
      v_type.name, v_type.color, v_type.duration_min, v_type.capacity, 'booked'
    )
    on conflict (athlete_id, date, start_time, session_type_id) do update
      set status = 'booked', trainer_id = excluded.trainer_id,
          type_name = excluded.type_name, type_color = excluded.type_color,
          duration_min = excluded.duration_min, capacity = excluded.capacity
    returning id into v_booking_id;

    if v_mem.sessions_total is not null then
      update public.memberships set sessions_used = sessions_used + 1 where id = v_mem.id;
    end if;

    update public.session_waitlist
       set status = 'promoted', promoted_booking_id = v_booking_id, promoted_at = now()
     where id = v_w.id;

    begin
      insert into public.notifications
        (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
      values (
        v_w.athlete_id, 'athlete', p_trainer_id, v_w.athlete_id, 'waitlist_promoted',
        'Oslobodilo se mesto',
        v_type.name || ' • ' || to_char(p_date, 'DD.MM.') || ' u ' || to_char(p_start_time, 'HH24:MI')
          || '. Rezervisan ti je termin',
        jsonb_build_object('slot_date', p_date, 'start_time', p_start_time,
          'session_name', v_type.name, 'session_color', v_type.color, 'booking_id', v_booking_id)
      );
    exception when others then null;
    end;
  end loop;
end;
$function$;
