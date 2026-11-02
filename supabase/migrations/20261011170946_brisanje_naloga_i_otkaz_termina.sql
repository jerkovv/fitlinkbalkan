-- Dva blokera iz testa pre izdanja (2026-10-11); oba vaze i za aplikaciju iz prodavnice.

-- 1) Brisanje naloga je padalo svakom ko je ikad rezervisao termin.
CREATE OR REPLACE FUNCTION public.notify_booking_canceled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trainer_id uuid;
  v_athlete_name text;
  v_session_name text;
  v_session_color text;
BEGIN
  -- Rezervacija nestaje zato sto se brise ceo nalog (vezbaca ili trenera): nema kome i nema
  -- od koga da se javi. Bez ovoga je brisanje naloga padalo, jer profil vise ne postoji pa
  -- obavestenje ostane bez naslova.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.athlete_id)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.trainer_id) THEN
    RETURN OLD;
  END IF;

  SELECT st.trainer_id, st.name, st.color INTO v_trainer_id, v_session_name, v_session_color
  FROM public.session_types st WHERE st.id = OLD.session_type_id;

  v_session_name := COALESCE(v_session_name, OLD.type_name, 'Trening');
  v_session_color := COALESCE(v_session_color, OLD.type_color, 'violet');
  IF v_trainer_id IS NULL THEN
    v_trainer_id := OLD.trainer_id;
  END IF;

  IF auth.uid() IS NOT DISTINCT FROM OLD.athlete_id THEN
    -- Vezbac je sam otkazao -> obavesti trenera
    IF NOT public.should_notify_trainer(v_trainer_id, 'bookings') THEN
      RETURN OLD;
    END IF;

    SELECT COALESCE(p.full_name, 'Vežbač') INTO v_athlete_name
    FROM public.profiles p WHERE p.id = OLD.athlete_id;

    INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
    VALUES (v_trainer_id, 'trainer', OLD.athlete_id, OLD.athlete_id, 'booking_canceled',
      v_athlete_name || ' otkazao termin',
      v_session_name || ' • ' || to_char(OLD.date, 'DD.MM.') || ' u ' || to_char(OLD.start_time, 'HH24:MI'),
      jsonb_build_object('slot_date', OLD.date, 'start_time', OLD.start_time,
        'session_name', v_session_name, 'session_color', v_session_color));
  ELSE
    -- Trener (ili neko drugi) je otkazao -> obavesti vezbaca
    INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
    VALUES (OLD.athlete_id, 'athlete', auth.uid(), OLD.athlete_id, 'booking_canceled_by_trainer',
      'Trener je otkazao tvoj termin',
      v_session_name || ' • ' || to_char(OLD.date, 'DD.MM.') || ' u ' || to_char(OLD.start_time, 'HH24:MI'),
      jsonb_build_object('slot_date', OLD.date, 'start_time', OLD.start_time,
        'session_name', v_session_name, 'session_color', v_session_color));
  END IF;

  RETURN OLD;
END;
$function$;

-- 2) Trener otkaze termin za taj dan: rezervacije se otkazuju, trening se vraca, lista
--    cekanja se prazni. Otkazan termin vise ne prima nikoga sa liste cekanja.
CREATE OR REPLACE FUNCTION public.notify_slot_canceled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session_name text;
  v_session_color text;
  v_start_time time;
  v_session_type_id uuid;
  r record;
BEGIN
  IF NEW.is_canceled IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_canceled IS NOT DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  v_start_time := NEW.start_time;
  v_session_type_id := NEW.session_type_id;

  IF (v_start_time IS NULL OR v_session_type_id IS NULL) AND NEW.template_id IS NOT NULL THEN
    SELECT COALESCE(v_start_time, sst.start_time), COALESCE(v_session_type_id, sst.session_type_id)
      INTO v_start_time, v_session_type_id
    FROM public.session_slot_templates sst
    WHERE sst.id = NEW.template_id;
  END IF;

  SELECT st.name, st.color INTO v_session_name, v_session_color
  FROM public.session_types st WHERE st.id = v_session_type_id;
  v_session_name := COALESCE(v_session_name, 'Trening');
  v_session_color := COALESCE(v_session_color, 'violet');

  IF v_start_time IS NULL THEN
    RETURN NEW;
  END IF;

  -- Termin koji je vec poceo se ne dira: trening je odrzan.
  IF public._pocetak_termina(NEW.date, v_start_time) <= now() THEN
    RETURN NEW;
  END IF;

  -- Ranije je otkazivanje termina samo slalo obavestenje: vezbaci su ostajali rezervisani,
  -- trening im je ostajao potrosen, a termin vise nisu videli pa nisu mogli ni da otkazu.
  FOR r IN
    SELECT sb.id AS booking_id, sb.athlete_id
    FROM public.session_bookings sb
    WHERE sb.trainer_id = NEW.trainer_id
      AND sb.date = NEW.date
      AND sb.start_time = v_start_time
      AND sb.status = 'booked'
      AND (v_session_type_id IS NULL OR sb.session_type_id = v_session_type_id)
    FOR UPDATE
  LOOP
    -- Otkazivanje rezervacije; obavestenje vezbacu salje okidac na promenu statusa.
    UPDATE public.session_bookings
       SET status = 'cancelled', late_cancel = false, cancelled_at = now()
     WHERE id = r.booking_id;

    -- Trening se vraca na clanarinu, isto kao kad vezbac otkaze u roku.
    UPDATE public.memberships
       SET sessions_used = GREATEST(0, sessions_used - 1)
     WHERE id = (
       SELECT id FROM public.memberships
        WHERE athlete_id = r.athlete_id
          AND trainer_id = NEW.trainer_id
          AND status = 'active'
          AND sessions_total IS NOT NULL
        ORDER BY ends_on DESC NULLS LAST
        LIMIT 1
     );
  END LOOP;

  -- Niko vise ne ceka na termin koji se nece odrzati.
  UPDATE public.session_waitlist
     SET status = 'cancelled'
   WHERE trainer_id = NEW.trainer_id AND date = NEW.date AND start_time = v_start_time
     AND status = 'waiting'
     AND (v_session_type_id IS NULL OR session_type_id = v_session_type_id);

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public._promote_waitlist(p_trainer_id uuid, p_date date, p_start_time time without time zone, p_session_type_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  v_slot_at := public._pocetak_termina(p_date, p_start_time);
  if v_slot_at <= now() then return; end if;

  -- Termin koji je trener otkazao za taj dan ne prima nikoga sa liste cekanja. Ranije je
  -- svako oslobodjeno mesto u otkazanom terminu upisivalo sledeceg i trosilo mu trening.
  if exists (
    select 1
      from public.session_slot_overrides o
      left join public.session_slot_templates t on t.id = o.template_id
     where o.trainer_id = p_trainer_id and o.date = p_date and o.is_canceled
       and coalesce(o.start_time, t.start_time) = p_start_time
       and coalesce(o.session_type_id, t.session_type_id) is not distinct from p_session_type_id
  ) then
    update public.session_waitlist set status = 'cancelled'
     where trainer_id = p_trainer_id and date = p_date and start_time = p_start_time
       and session_type_id = p_session_type_id and status = 'waiting';
    return;
  end if;

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
          duration_min = excluded.duration_min, capacity = excluded.capacity,
          late_cancel = false, cancelled_at = null
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
