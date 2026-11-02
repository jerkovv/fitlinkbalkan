-- Već primenjeno na bazu preko MCP; ovaj fajl je samo za version control.
--
-- Kasno otkazivanje: posle roka koji trener podesi (trainers.cancel_cutoff_hours) otkazivanje
-- i dalje oslobadja mesto, ali se trening ne vraca u paket (racuna se kao odradjen).
-- Uz to: pocetak termina se racuna po Beogradu; baza radi u UTC, pa je termin u 18:00
-- ranije bio 20:00 po nasem vremenu (rok od 2h leti prakticno nije vazio).
ALTER TABLE public.session_bookings
  ADD COLUMN IF NOT EXISTS late_cancel boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE OR REPLACE FUNCTION public._pocetak_termina(p_date date, p_start_time time)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (p_date + p_start_time) AT TIME ZONE 'Europe/Belgrade'
$$;
REVOKE EXECUTE ON FUNCTION public._pocetak_termina(date, time) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.book_session(p_trainer_id uuid, p_date date, p_start_time time without time zone, p_session_type_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_athlete_id     uuid := auth.uid();
  v_type           session_types%ROWTYPE;
  v_booked         int;
  v_mem            memberships%ROWTYPE;
  v_booking_id     uuid;
  v_existing_id    uuid;
  v_existing_status text;
BEGIN
  IF v_athlete_id IS NULL THEN
    RAISE EXCEPTION 'Niste prijavljeni';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM athletes WHERE id = v_athlete_id AND trainer_id = p_trainer_id
  ) THEN
    RAISE EXCEPTION 'Niste član ovog trenera';
  END IF;

  -- Termin koji je vec poceo ili prosao ne moze da se zakaze (vreme po Beogradu)
  IF public._pocetak_termina(p_date, p_start_time) <= now() THEN
    RAISE EXCEPTION 'Termin je već prošao';
  END IF;

  SELECT * INTO v_type FROM session_types WHERE id = p_session_type_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tip sesije ne postoji';
  END IF;

  -- Postojeci red za isti slot (UNIQUE je bez statusa)
  SELECT id, status INTO v_existing_id, v_existing_status
    FROM session_bookings
   WHERE athlete_id = v_athlete_id
     AND date = p_date
     AND start_time = p_start_time
     AND session_type_id = p_session_type_id;

  -- Vec rezervisano: idempotentno, bez duple naplate
  IF v_existing_id IS NOT NULL AND v_existing_status = 'booked' THEN
    RETURN v_existing_id;
  END IF;

  -- Aktivna clanarina (najsvezija koja pokriva datum)
  SELECT * INTO v_mem
    FROM memberships
   WHERE athlete_id = v_athlete_id
     AND trainer_id = p_trainer_id
     AND status = 'active'
     AND (ends_on IS NULL OR ends_on >= p_date)
   ORDER BY ends_on DESC NULLS LAST
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nemate aktivnu članarinu';
  END IF;

  IF v_mem.sessions_total IS NOT NULL
     AND v_mem.sessions_used >= v_mem.sessions_total THEN
    RAISE EXCEPTION 'Iskoristili ste sve treninge u članarini';
  END IF;

  -- Kapacitet (broji samo booked; otkazani red se ne broji)
  SELECT COUNT(*) INTO v_booked
    FROM session_bookings
   WHERE trainer_id = p_trainer_id
     AND date = p_date
     AND start_time = p_start_time
     AND session_type_id = p_session_type_id
     AND status = 'booked';

  IF v_booked >= v_type.capacity THEN
    RAISE EXCEPTION 'Termin je pun';
  END IF;

  IF v_existing_id IS NOT NULL THEN
    -- Ponovna rezervacija posle otkazivanja: oznaka kasnog otkazivanja se brise.
    UPDATE session_bookings
       SET status = 'booked',
           trainer_id = p_trainer_id,
           type_name = v_type.name,
           type_color = v_type.color,
           duration_min = v_type.duration_min,
           capacity = v_type.capacity,
           late_cancel = false,
           cancelled_at = NULL
     WHERE id = v_existing_id
     RETURNING id INTO v_booking_id;
  ELSE
    INSERT INTO session_bookings (
      trainer_id, athlete_id, date, start_time, session_type_id,
      type_name, type_color, duration_min, capacity, status
    ) VALUES (
      p_trainer_id, v_athlete_id, p_date, p_start_time, p_session_type_id,
      v_type.name, v_type.color, v_type.duration_min, v_type.capacity, 'booked'
    ) RETURNING id INTO v_booking_id;
  END IF;

  IF v_mem.sessions_total IS NOT NULL THEN
    UPDATE memberships SET sessions_used = sessions_used + 1 WHERE id = v_mem.id;
  END IF;

  RETURN v_booking_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_waitlist(p_trainer_id uuid, p_date date, p_start_time time without time zone, p_session_type_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_athlete uuid := auth.uid();
  v_type    public.session_types%rowtype;
  v_booked  int;
  v_slot_at timestamptz;
  v_canceled boolean;
  v_id uuid;
begin
  if v_athlete is null then raise exception 'Niste prijavljeni'; end if;

  if not exists (select 1 from public.athletes where id = v_athlete and trainer_id = p_trainer_id) then
    raise exception 'Niste član ovog trenera';
  end if;

  if not exists (
    select 1 from public.memberships
     where athlete_id = v_athlete and trainer_id = p_trainer_id and status = 'active'
       and (ends_on is null or ends_on >= p_date)
  ) then
    raise exception 'Nemate aktivnu članarinu';
  end if;

  select * into v_type from public.session_types where id = p_session_type_id;
  if not found then raise exception 'Tip sesije ne postoji'; end if;

  v_slot_at := public._pocetak_termina(p_date, p_start_time);
  if v_slot_at <= now() then raise exception 'Termin je već prošao'; end if;

  select bool_or(coalesce(is_canceled, false)) into v_canceled
    from public.session_slot_overrides
   where trainer_id = p_trainer_id and date = p_date and session_type_id = p_session_type_id
     and (start_time = p_start_time or start_time is null);
  if coalesce(v_canceled, false) then raise exception 'Termin je otkazan'; end if;

  if exists (
    select 1 from public.session_bookings
     where trainer_id = p_trainer_id and date = p_date and start_time = p_start_time
       and session_type_id = p_session_type_id and athlete_id = v_athlete and status = 'booked'
  ) then
    raise exception 'Već si prijavljen na ovaj termin';
  end if;

  select count(*) into v_booked
    from public.session_bookings
   where trainer_id = p_trainer_id and date = p_date and start_time = p_start_time
     and session_type_id = p_session_type_id and status = 'booked';
  if v_booked < v_type.capacity then
    raise exception 'Termin nije pun, možeš da rezervišeš odmah';
  end if;

  if exists (
    select 1 from public.session_waitlist
     where trainer_id = p_trainer_id and date = p_date and start_time = p_start_time
       and session_type_id = p_session_type_id and athlete_id = v_athlete and status = 'waiting'
  ) then
    raise exception 'Već si na listi čekanja za ovaj termin';
  end if;

  insert into public.session_waitlist
    (trainer_id, athlete_id, date, start_time, session_type_id, status)
  values (p_trainer_id, v_athlete, p_date, p_start_time, p_session_type_id, 'waiting')
  returning id into v_id;

  begin
    insert into public.notifications
      (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
    select p_trainer_id, 'trainer', v_athlete, v_athlete, 'waitlist_joined',
      coalesce(pr.full_name, 'Vežbač') || ' na listi čekanja',
      v_type.name || ' • ' || to_char(p_date, 'DD.MM.') || ' u ' || to_char(p_start_time, 'HH24:MI'),
      jsonb_build_object('slot_date', p_date, 'start_time', p_start_time,
        'session_name', v_type.name, 'session_color', v_type.color)
    from public.profiles pr where pr.id = v_athlete;
  exception when others then null;
  end;

  return v_id;
end;
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

-- Otkazivanje. U roku: trening se vraca u paket. Posle roka: samo uz p_kasno (vezbac je
-- potvrdio da zna), mesto se oslobadja, a trening ostaje potrosen (late_cancel).
-- Stara aplikacija salje samo p_booking_id, pa posle roka i dalje dobija poruku.
DROP FUNCTION IF EXISTS public.cancel_session_booking(uuid);
CREATE OR REPLACE FUNCTION public.cancel_session_booking(p_booking_id uuid, p_kasno boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_b       public.session_bookings%ROWTYPE;
  v_cutoff  integer;
  v_slot_at timestamptz;
  v_kasno   boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Niste prijavljeni';
  END IF;

  SELECT * INTO v_b
    FROM public.session_bookings
   WHERE id = p_booking_id
     AND athlete_id = v_uid
     AND status = 'booked'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rezervacija ne postoji ili je već otkazana';
  END IF;

  v_slot_at := public._pocetak_termina(v_b.date, v_b.start_time);
  IF v_slot_at <= now() THEN
    RAISE EXCEPTION 'Ne možeš otkazati termin koji je već počeo';
  END IF;

  SELECT COALESCE(cancel_cutoff_hours, 0) INTO v_cutoff
    FROM public.trainers WHERE id = v_b.trainer_id;
  v_cutoff := COALESCE(v_cutoff, 0);
  v_kasno := v_cutoff > 0 AND now() > v_slot_at - make_interval(hours => v_cutoff);

  IF v_kasno AND NOT COALESCE(p_kasno, false) THEN
    RAISE EXCEPTION 'Otkazivanje je dozvoljeno najkasnije % h pre termina. Kasnije otkazivanje računa se kao iskorišćen trening.', v_cutoff;
  END IF;

  UPDATE public.session_bookings
     SET status = 'cancelled', late_cancel = v_kasno, cancelled_at = now()
   WHERE id = p_booking_id;

  -- U roku: vrati 1 trening na aktivnu clanarinu (najsvezija sa limitom).
  IF NOT v_kasno THEN
    UPDATE public.memberships
       SET sessions_used = GREATEST(0, sessions_used - 1)
     WHERE id = (
       SELECT id FROM public.memberships
        WHERE athlete_id = v_b.athlete_id
          AND trainer_id = v_b.trainer_id
          AND status = 'active'
          AND sessions_total IS NOT NULL
        ORDER BY ends_on DESC NULLS LAST
        LIMIT 1
     );
  END IF;

  RETURN jsonb_build_object('kasno', v_kasno, 'vracen_trening', NOT v_kasno, 'rok_sati', v_cutoff);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cancel_session_booking(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_session_booking(uuid, boolean) TO authenticated;

-- Stari put je zaobilazio rok i uvek vracao trening; sada ide kroz isto pravilo.
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.cancel_session_booking(p_booking_id, false);
END;
$$;

-- Obavestenje treneru kaze i kad je otkazivanje bilo kasno.
CREATE OR REPLACE FUNCTION public.notify_booking_status_canceled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trainer_id   uuid;
  v_athlete_name text;
  v_session_name text;
  v_session_color text;
BEGIN
  IF NEW.status NOT IN ('cancelled','canceled') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT st.trainer_id, st.name, st.color
    INTO v_trainer_id, v_session_name, v_session_color
    FROM public.session_types st
   WHERE st.id = NEW.session_type_id;

  IF v_trainer_id IS NULL THEN
    v_trainer_id := NEW.trainer_id;
  END IF;
  v_session_name  := COALESCE(v_session_name, NEW.type_name, 'Trening');
  v_session_color := COALESCE(v_session_color, NEW.type_color, 'violet');

  IF auth.uid() IS NOT DISTINCT FROM NEW.athlete_id THEN
    -- Vezbac je sam otkazao -> obavesti trenera
    IF NOT public.should_notify_trainer(v_trainer_id, 'bookings') THEN
      RETURN NEW;
    END IF;

    SELECT COALESCE(p.full_name, 'Vežbač') INTO v_athlete_name
      FROM public.profiles p WHERE p.id = NEW.athlete_id;

    INSERT INTO public.notifications
      (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
    VALUES (
      v_trainer_id, 'trainer', NEW.athlete_id, NEW.athlete_id, 'booking_canceled',
      v_athlete_name || CASE WHEN NEW.late_cancel THEN ' kasno otkazao termin' ELSE ' otkazao termin' END,
      v_session_name || ' • ' || to_char(NEW.date, 'DD.MM.') || ' u ' || to_char(NEW.start_time, 'HH24:MI')
        || CASE WHEN NEW.late_cancel THEN ' • računa se kao trening' ELSE '' END,
      jsonb_build_object('slot_date', NEW.date, 'start_time', NEW.start_time,
        'session_name', v_session_name, 'session_color', v_session_color, 'booking_id', NEW.id,
        'late_cancel', NEW.late_cancel)
    );
  ELSE
    -- Trener (ili neko drugi) je otkazao -> obavesti vezbaca
    INSERT INTO public.notifications
      (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
    VALUES (
      NEW.athlete_id, 'athlete', auth.uid(), NEW.athlete_id, 'booking_canceled_by_trainer',
      'Trener je otkazao tvoj termin',
      v_session_name || ' • ' || to_char(NEW.date, 'DD.MM.') || ' u ' || to_char(NEW.start_time, 'HH24:MI'),
      jsonb_build_object('slot_date', NEW.date, 'start_time', NEW.start_time,
        'session_name', v_session_name, 'session_color', v_session_color, 'booking_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$function$;
