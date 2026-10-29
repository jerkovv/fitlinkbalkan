-- Rezervacija termina: provera da termin stvarno postoji, brava za poslednje mesto
-- i ponovna rezervacija posle kasnog otkazivanja bez druge naplate.

-- Da li termin za taj dan postoji u rasporedu i moze da primi ljude: aktivan sablon za taj
-- dan u nedelji (ili termin dodat samo za taj dan), nije otkazan za taj dan, a vrsta sesije
-- pripada tom treneru i nije arhivirana. Ista pravila po kojima get_day_slots prikazuje termin.
CREATE OR REPLACE FUNCTION public._termin_u_rasporedu(
  p_trainer_id uuid, p_date date, p_start_time time without time zone, p_session_type_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.session_slot_templates t
      JOIN public.session_types st ON st.id = t.session_type_id
      LEFT JOIN public.session_slot_overrides o ON o.template_id = t.id AND o.date = p_date
     WHERE t.trainer_id = p_trainer_id
       AND t.weekday = (EXTRACT(ISODOW FROM p_date)::int) - 1
       AND t.is_active
       AND t.session_type_id = p_session_type_id
       AND st.trainer_id = p_trainer_id
       AND NOT st.is_archived
     GROUP BY t.id, t.start_time
    HAVING NOT bool_or(COALESCE(o.is_canceled, false))
       AND bool_or(COALESCE(o.start_time, t.start_time) = p_start_time)
  ) OR EXISTS (
    SELECT 1
      FROM public.session_slot_overrides o
      JOIN public.session_types st ON st.id = o.session_type_id
     WHERE o.trainer_id = p_trainer_id
       AND o.date = p_date
       AND o.template_id IS NULL
       AND NOT o.is_canceled
       AND o.start_time = p_start_time
       AND o.session_type_id = p_session_type_id
       AND st.trainer_id = p_trainer_id
       AND NOT st.is_archived
  )
$function$;

REVOKE EXECUTE ON FUNCTION public._termin_u_rasporedu(uuid, date, time without time zone, uuid)
  FROM PUBLIC, anon, authenticated;

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
  v_existing_late  boolean;
  v_vec_naplacen   boolean := false;
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

  -- Ista brava kao u _promote_waitlist: dva vezbaca koja u istom trenutku uzimaju poslednje
  -- mesto (ili vezbac i lista cekanja) idu jedan za drugim, pa termin ne moze da se prepuni.
  PERFORM pg_advisory_xact_lock(
    hashtext(p_trainer_id::text || p_date::text || p_start_time::text || p_session_type_id::text)
  );

  -- Postojeci red za isti slot (UNIQUE je bez statusa)
  SELECT id, status, late_cancel INTO v_existing_id, v_existing_status, v_existing_late
    FROM session_bookings
   WHERE athlete_id = v_athlete_id
     AND date = p_date
     AND start_time = p_start_time
     AND session_type_id = p_session_type_id;

  -- Vec rezervisano: idempotentno, bez duple naplate
  IF v_existing_id IS NOT NULL AND v_existing_status = 'booked' THEN
    RETURN v_existing_id;
  END IF;

  -- Termin mora da postoji u rasporedu za taj dan. Ranije je prolazila rezervacija termina koji
  -- je trener otkazao, koji ne postoji ili cija je vrsta arhivirana (ili pripada drugom treneru):
  -- trening se potrosi, a vezbac taj termin nigde ne vidi da bi ga otkazao.
  IF NOT public._termin_u_rasporedu(p_trainer_id, p_date, p_start_time, p_session_type_id) THEN
    RAISE EXCEPTION 'Termin više nije dostupan. Osveži raspored.';
  END IF;

  -- Kasno otkazan pa ponovo rezervisan isti termin: trening je vec naplacen pri otkazivanju,
  -- pa se ne naplacuje drugi put i ne trazi se slobodan trening u paketu.
  v_vec_naplacen := v_existing_id IS NOT NULL
                    AND v_existing_status IN ('cancelled', 'canceled')
                    AND COALESCE(v_existing_late, false);

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

  IF NOT v_vec_naplacen
     AND v_mem.sessions_total IS NOT NULL
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

  IF v_mem.sessions_total IS NOT NULL AND NOT v_vec_naplacen THEN
    UPDATE memberships SET sessions_used = sessions_used + 1 WHERE id = v_mem.id;
  END IF;

  RETURN v_booking_id;
END;
$function$;
