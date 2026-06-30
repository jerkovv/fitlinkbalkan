-- Block booking a slot whose start time has already passed.
-- Mirrors the past-slot guard in join_waitlist and _promote_waitlist for consistency.
create or replace function public.book_session(p_trainer_id uuid, p_date date, p_start_time time without time zone, p_session_type_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- Termin koji je vec poceo ili prosao ne moze da se zakaze
  IF (p_date::timestamp + p_start_time)::timestamptz <= now() THEN
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
    UPDATE session_bookings
       SET status = 'booked',
           trainer_id = p_trainer_id,
           type_name = v_type.name,
           type_color = v_type.color,
           duration_min = v_type.duration_min,
           capacity = v_type.capacity
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
