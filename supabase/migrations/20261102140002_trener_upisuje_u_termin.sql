-- Trener sam upisuje ljude u termin: klijenta sa svog spiska ili gosta (samo ime, bez naloga).
--
-- Rezervacija dobija:
--   guest_name  ime gosta (athlete_id je tada NULL)
--   added_by    trener koji je upisao (NULL kad je vezbac rezervisao sam ili sa liste cekanja)
--   charged     da li je trening skinut sa clanarine. Vracanje treninga (brisanje, otkazivanje
--               termina, otkazivanje u roku) vraca samo ono sto je skinuto.

ALTER TABLE public.session_bookings ALTER COLUMN athlete_id DROP NOT NULL;
ALTER TABLE public.session_bookings ADD COLUMN IF NOT EXISTS guest_name text;
ALTER TABLE public.session_bookings ADD COLUMN IF NOT EXISTS added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.session_bookings ADD COLUMN IF NOT EXISTS charged boolean NOT NULL DEFAULT true;

ALTER TABLE public.session_bookings DROP CONSTRAINT IF EXISTS session_bookings_ko_dolazi;
ALTER TABLE public.session_bookings ADD CONSTRAINT session_bookings_ko_dolazi
  CHECK (athlete_id IS NOT NULL OR length(btrim(COALESCE(guest_name, ''))) > 0);

-- Otkazano u roku je vec vraceno na clanarinu.
UPDATE public.session_bookings
   SET charged = false
 WHERE status IN ('cancelled', 'canceled') AND NOT late_cancel;

-- Nova vrsta obavestenja: vezbac saznaje da ga je trener upisao.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind = ANY (ARRAY[
  'booking_created', 'booking_canceled', 'booking_canceled_by_trainer', 'booking_added_by_trainer',
  'workout_completed', 'message', 'program_assigned', 'nutrition_assigned', 'message_from_trainer',
  'membership_expiring', 'membership_expired', 'membership_activated', 'membership_rejected',
  'payment_request', 'payment_marked', 'broadcast', 'generic', 'pr_set', 'waitlist_promoted',
  'waitlist_joined', 'workout_forgotten', 'fitlink_sub_expiring', 'fitlink_sub_expired']));

-- ============================================================================
-- Upis od strane trenera
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trainer_add_booking(
  p_date date,
  p_start_time time,
  p_session_type_id uuid,
  p_athlete_id uuid DEFAULT NULL,
  p_guest_name text DEFAULT NULL,
  p_charge boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trainer   uuid := auth.uid();
  v_gost      text := NULLIF(btrim(COALESCE(p_guest_name, '')), '');
  v_type      public.session_types%ROWTYPE;
  v_mem       public.memberships%ROWTYPE;
  v_booked    int;
  v_ex_id     uuid;
  v_ex_status text;
  v_ex_late   boolean;
  v_ex_charged boolean;
  v_vec_naplacen boolean := false;
  v_naplati   boolean := false;
  v_razlog    text;
  v_id        uuid;
BEGIN
  IF v_trainer IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni'; END IF;
  PERFORM public.require_active_trainer_sub();

  IF (p_athlete_id IS NULL) = (v_gost IS NULL) THEN
    RAISE EXCEPTION 'Izaberi klijenta ili upiši ime gosta';
  END IF;
  IF v_gost IS NOT NULL AND length(v_gost) > 80 THEN
    RAISE EXCEPTION 'Ime gosta je predugačko';
  END IF;

  SELECT * INTO v_type FROM public.session_types
   WHERE id = p_session_type_id AND trainer_id = v_trainer;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vrsta termina ne postoji'; END IF;

  IF p_athlete_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.athletes WHERE id = p_athlete_id AND trainer_id = v_trainer
  ) THEN
    RAISE EXCEPTION 'Vežbač nije na tvom spisku';
  END IF;

  -- Ista brava kao book_session i _promote_waitlist: termin ne moze da se prepuni.
  PERFORM pg_advisory_xact_lock(
    hashtext(v_trainer::text || p_date::text || p_start_time::text || p_session_type_id::text)
  );

  IF NOT public._termin_u_rasporedu(v_trainer, p_date, p_start_time, p_session_type_id) THEN
    RAISE EXCEPTION 'Termin nije u rasporedu za taj dan. Osveži raspored.';
  END IF;

  IF p_athlete_id IS NOT NULL THEN
    SELECT id, status, late_cancel, charged
      INTO v_ex_id, v_ex_status, v_ex_late, v_ex_charged
      FROM public.session_bookings
     WHERE athlete_id = p_athlete_id AND date = p_date
       AND start_time = p_start_time AND session_type_id = p_session_type_id;
    IF v_ex_id IS NOT NULL AND v_ex_status = 'booked' THEN
      RETURN jsonb_build_object('success', true, 'booking_id', v_ex_id, 'vec_upisan', true);
    END IF;
  END IF;

  SELECT count(*) INTO v_booked
    FROM public.session_bookings
   WHERE trainer_id = v_trainer AND date = p_date AND start_time = p_start_time
     AND session_type_id = p_session_type_id AND status = 'booked';
  IF v_booked >= v_type.capacity THEN
    RAISE EXCEPTION 'Termin je pun';
  END IF;

  IF p_athlete_id IS NOT NULL THEN
    -- Kasno otkazan pa ponovo upisan: trening je vec skinut pri otkazivanju.
    v_vec_naplacen := v_ex_id IS NOT NULL AND v_ex_status IN ('cancelled', 'canceled')
                      AND COALESCE(v_ex_late, false) AND COALESCE(v_ex_charged, true);
    IF v_vec_naplacen THEN
      NULL;
    ELSIF NOT COALESCE(p_charge, true) THEN
      v_razlog := 'bez_naplate';
    ELSE
      SELECT * INTO v_mem FROM public.memberships
       WHERE athlete_id = p_athlete_id AND trainer_id = v_trainer AND status = 'active'
         AND (ends_on IS NULL OR ends_on >= p_date)
       ORDER BY ends_on DESC NULLS LAST
       LIMIT 1;
      IF NOT FOUND THEN
        v_razlog := 'nema_clanarinu';
      ELSIF v_mem.sessions_total IS NOT NULL AND v_mem.sessions_used >= v_mem.sessions_total THEN
        v_razlog := 'nema_treninga';
      ELSE
        v_naplati := true;
      END IF;
    END IF;
  END IF;

  IF v_ex_id IS NOT NULL THEN
    UPDATE public.session_bookings
       SET status = 'booked', trainer_id = v_trainer,
           type_name = v_type.name, type_color = v_type.color,
           duration_min = v_type.duration_min, capacity = v_type.capacity,
           late_cancel = false, cancelled_at = NULL,
           added_by = v_trainer, charged = (v_naplati OR v_vec_naplacen)
     WHERE id = v_ex_id
     RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.session_bookings (
      trainer_id, athlete_id, guest_name, added_by, charged,
      date, start_time, session_type_id,
      type_name, type_color, duration_min, capacity, status
    ) VALUES (
      v_trainer, p_athlete_id, v_gost, v_trainer, v_naplati,
      p_date, p_start_time, p_session_type_id,
      v_type.name, v_type.color, v_type.duration_min, v_type.capacity, 'booked'
    ) RETURNING id INTO v_id;
  END IF;

  IF v_naplati AND v_mem.sessions_total IS NOT NULL THEN
    UPDATE public.memberships SET sessions_used = sessions_used + 1 WHERE id = v_mem.id;
  END IF;

  -- Ko je cekao na ovaj termin, vise ne ceka.
  IF p_athlete_id IS NOT NULL THEN
    UPDATE public.session_waitlist
       SET status = 'promoted', promoted_booking_id = v_id, promoted_at = now()
     WHERE trainer_id = v_trainer AND athlete_id = p_athlete_id AND date = p_date
       AND start_time = p_start_time AND session_type_id = p_session_type_id
       AND status = 'waiting';
  END IF;

  RETURN jsonb_build_object('success', true, 'booking_id', v_id,
                            'naplaceno', v_naplati OR v_vec_naplacen, 'razlog', v_razlog);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trainer_add_booking(date, time, uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_add_booking(date, time, uuid, uuid, text, boolean) TO authenticated, service_role;

-- ============================================================================
-- Vezbac rezervise sam: isto kao do sada, plus nove kolone
-- ============================================================================
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
  v_existing_charged boolean;
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
  SELECT id, status, late_cancel, charged
    INTO v_existing_id, v_existing_status, v_existing_late, v_existing_charged
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
  -- pa se ne naplacuje drugi put i ne trazi se slobodan trening u paketu. Vazi samo ako je
  -- trening tada bio skinut (trener moze da upise bez skidanja).
  v_vec_naplacen := v_existing_id IS NOT NULL
                    AND v_existing_status IN ('cancelled', 'canceled')
                    AND COALESCE(v_existing_late, false)
                    AND COALESCE(v_existing_charged, true);

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
           cancelled_at = NULL,
           added_by = NULL,
           charged = true
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

-- ============================================================================
-- Vezbac otkazuje: u roku vraca trening samo ako je bio skinut
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cancel_session_booking(p_booking_id uuid, p_kasno boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_b       public.session_bookings%ROWTYPE;
  v_cutoff  integer;
  v_slot_at timestamptz;
  v_kasno   boolean;
  v_vrati   boolean;
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

  v_vrati := NOT v_kasno AND v_b.charged;

  UPDATE public.session_bookings
     SET status = 'cancelled', late_cancel = v_kasno, cancelled_at = now(),
         charged = CASE WHEN v_vrati THEN false ELSE charged END
   WHERE id = p_booking_id;

  -- U roku: vrati 1 trening na aktivnu clanarinu (najsvezija sa limitom).
  IF v_vrati THEN
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

  RETURN jsonb_build_object('kasno', v_kasno, 'vracen_trening', v_vrati, 'rok_sati', v_cutoff);
END;
$function$;

-- ============================================================================
-- Trener brise rezervaciju: vraca trening samo ako je bio skinut
-- ============================================================================
CREATE OR REPLACE FUNCTION public._tg_vrati_trening_na_uklanjanje()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Samo zauzeto mesto u terminu koji jos nije poceo, i samo kad ga uklanja trener tog termina.
  -- Kasno otkazan red (status cancelled) ostaje naplacen; brisanje celog naloga ne vraca nista.
  -- Gost i upis bez skidanja treninga nemaju sta da vrate.
  IF OLD.status = 'booked'
     AND OLD.charged
     AND OLD.athlete_id IS NOT NULL
     AND auth.uid() IS NOT DISTINCT FROM OLD.trainer_id
     AND public._pocetak_termina(OLD.date, OLD.start_time) > now()
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.athlete_id)
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.trainer_id) THEN
    UPDATE public.memberships
       SET sessions_used = GREATEST(0, sessions_used - 1)
     WHERE id = (
       SELECT id FROM public.memberships
        WHERE athlete_id = OLD.athlete_id
          AND trainer_id = OLD.trainer_id
          AND status = 'active'
          AND sessions_total IS NOT NULL
        ORDER BY ends_on DESC NULLS LAST
        LIMIT 1
     );
  END IF;
  RETURN OLD;
END;
$function$;

-- ============================================================================
-- Trener otkazuje ceo termin: vraca trening samo onima kojima je skinut
-- ============================================================================
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
    SELECT sb.id AS booking_id, sb.athlete_id, sb.charged
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
       SET status = 'cancelled', late_cancel = false, cancelled_at = now(), charged = false
     WHERE id = r.booking_id;

    -- Trening se vraca na clanarinu, isto kao kad vezbac otkaze u roku.
    IF r.charged AND r.athlete_id IS NOT NULL THEN
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
    END IF;
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

-- ============================================================================
-- Lista cekanja: upis sa liste je obicna rezervacija (skinut trening, bez trenera)
-- ============================================================================
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

  -- Isto vazi i za termin koji je uklonjen iz nedeljnog rasporeda ili cija je vrsta arhivirana:
  -- postojece rezervacije ostaju, ali niko novi ne ulazi u njega.
  if not public._termin_u_rasporedu(p_trainer_id, p_date, p_start_time, p_session_type_id) then
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
          late_cancel = false, cancelled_at = null,
          added_by = null, charged = true
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

-- ============================================================================
-- Obavestenja
-- ============================================================================

-- Nova rezervacija: kad je upisao trener, javlja se vezbacu (trener zna sta je uradio);
-- gost nema kome da se javi.
CREATE OR REPLACE FUNCTION public.notify_booking_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trainer_id uuid; v_athlete_name text; v_session_name text; v_session_color text;
BEGIN
  IF NEW.athlete_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT st.trainer_id, st.name, st.color INTO v_trainer_id, v_session_name, v_session_color
  FROM public.session_types st WHERE st.id = NEW.session_type_id;
  v_trainer_id := COALESCE(v_trainer_id, NEW.trainer_id);
  v_session_name := COALESCE(v_session_name, NEW.type_name, 'Trening');
  v_session_color := COALESCE(v_session_color, NEW.type_color, 'violet');

  IF NEW.added_by IS NOT NULL THEN
    -- Obavestenje ne sme da obori upis.
    BEGIN
      INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
      VALUES (NEW.athlete_id, 'athlete', NEW.added_by, NEW.athlete_id, 'booking_added_by_trainer',
        'Trener te upisao na termin',
        v_session_name || ' • ' || to_char(NEW.date, 'DD.MM.') || ' u ' || to_char(NEW.start_time, 'HH24:MI'),
        jsonb_build_object('slot_date', NEW.date, 'start_time', NEW.start_time,
          'session_name', v_session_name, 'session_color', v_session_color, 'booking_id', NEW.id));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NEW;
  END IF;

  IF NOT public.should_notify_trainer(v_trainer_id, 'bookings') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.full_name, 'Vežbač') INTO v_athlete_name
  FROM public.profiles p WHERE p.id = NEW.athlete_id;

  INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
  VALUES (v_trainer_id, 'trainer', NEW.athlete_id, NEW.athlete_id, 'booking_created',
    COALESCE(v_athlete_name, 'Vežbač') || ' rezervisao termin',
    v_session_name || ' • ' || to_char(NEW.date, 'DD.MM.') || ' u ' || to_char(NEW.start_time, 'HH24:MI'),
    jsonb_build_object('slot_date', NEW.date, 'start_time', NEW.start_time,
      'session_name', v_session_name, 'session_color', v_session_color, 'booking_id', NEW.id));
  RETURN NEW;
END;
$function$;

-- Otkazivanje promenom statusa: gost nema kome da se javi (bez ovoga bi otkazivanje celog
-- termina sa gostom palo, jer obavestenje mora da ima primaoca).
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
  IF NEW.athlete_id IS NULL THEN
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

-- ============================================================================
-- Spiskovi dolazaka: gost ima ime, a umesto naloga nosi broj rezervacije
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_slot_attendees(p_trainer_id uuid, p_date date, p_start_time time without time zone, p_session_type_id uuid)
 RETURNS TABLE(athlete_id uuid, full_name text, is_me boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_allowed boolean;
  v_is_athlete boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Mora biti vežbač tog trenera
  SELECT EXISTS (
    SELECT 1 FROM public.athletes a
     WHERE a.id = v_uid AND a.trainer_id = p_trainer_id
  ) INTO v_is_athlete;

  IF NOT v_is_athlete THEN
    RAISE EXCEPTION 'Nemaš pristup ovim podacima';
  END IF;

  -- Provera setting-a
  SELECT COALESCE(t.show_attendees_to_athletes, false)
    INTO v_allowed
    FROM public.trainers t
   WHERE t.id = p_trainer_id;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Trener je sakrio listu učesnika';
  END IF;

  RETURN QUERY
  SELECT COALESCE(b.athlete_id, b.id) AS athlete_id,
         COALESCE(NULLIF(TRIM(p.full_name), ''), NULLIF(TRIM(b.guest_name), ''), 'Vežbač') AS full_name,
         COALESCE(b.athlete_id = v_uid, false) AS is_me
    FROM public.session_bookings b
    LEFT JOIN public.profiles p ON p.id = b.athlete_id
   WHERE b.trainer_id = p_trainer_id
     AND b.date = p_date
     AND b.start_time = p_start_time
     AND b.session_type_id = p_session_type_id
     AND b.status = 'booked'
   ORDER BY COALESCE(b.athlete_id = v_uid, false) DESC, 2 ASC;
END;
$function$;

-- Sat trenera: gosti se vide po imenu (ranije bi ih JOIN na profil izbacio).
CREATE OR REPLACE FUNCTION public.watch_trainer_day(p_token text, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t uuid := public._watch_kao_trener(p_token);
  v_dan date := COALESCE(p_date, (now() AT TIME ZONE 'Europe/Belgrade')::date);
BEGIN
  IF v_t IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  IF NOT public.trainer_has_active_fitlink_sub(v_t) THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'date', v_dan,
    'server_now_ms', (extract(epoch FROM now()) * 1000)::bigint,
    'pending_requests', (SELECT count(*) FROM public.membership_purchases mp
                          WHERE mp.trainer_id = v_t AND mp.status = 'pending'),
    'slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type_name', s.type_name,
        'color', s.type_color,
        'start_time', to_char(s.start_time, 'HH24:MI'),
        'starts_at_ms', (extract(epoch FROM public._pocetak_termina(v_dan, s.start_time)) * 1000)::bigint,
        'duration_min', s.duration_min,
        'capacity', s.capacity,
        'booked', s.booked_count,
        'athletes', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'athlete_id', COALESCE(sb.athlete_id, sb.id),
                   'name', COALESCE(p.full_name, sb.guest_name),
                   'guest', sb.athlete_id IS NULL,
                   'sessions_used', m.sessions_used,
                   'sessions_total', m.sessions_total
                 ) ORDER BY COALESCE(p.full_name, sb.guest_name)), '[]'::jsonb)
          FROM public.session_bookings sb
          LEFT JOIN public.profiles p ON p.id = sb.athlete_id
          LEFT JOIN LATERAL (
            SELECT mm.sessions_used, mm.sessions_total FROM public.memberships mm
             WHERE mm.athlete_id = sb.athlete_id AND mm.trainer_id = v_t AND mm.status = 'active'
             ORDER BY mm.created_at DESC LIMIT 1
          ) m ON true
          WHERE sb.trainer_id = v_t AND sb.date = v_dan AND sb.start_time = s.start_time
            AND sb.session_type_id = s.session_type_id AND sb.status = 'booked'
            AND (sb.athlete_id IS NULL OR p.id IS NOT NULL)
        )
      ) ORDER BY s.start_time)
      FROM public.get_day_slots(v_t, v_dan) s
      WHERE NOT s.is_canceled
    ), '[]'::jsonb)
  );
END;
$function$;
