-- Termin uklonjen iz nedeljnog rasporeda (ili vrsta sesije arhivirana) dok u njemu jos ima
-- rezervacija. Pravilo ostaje ono koje trener vidi u dijalogu: zakazane rezervacije ostaju.
-- Ali termin je nestajao iz get_day_slots, pa vezbac nije imao gde da otkaze, a trener je
-- video rezervaciju u zbiru bez kartice koju moze da otvori.
-- Zavisi od 01_book_session.sql (_termin_u_rasporedu).

-- get_day_slots: uz termine iz rasporeda vraca i termine koji vise nisu u rasporedu, a jos
-- imaju zauzeta mesta. Trener ih vidi sve, vezbac samo onaj u kom je sam rezervisan (da moze
-- da otkaze). Novu rezervaciju takvog termina odbija book_session. Kolone su iste kao pre.
CREATE OR REPLACE FUNCTION public.get_day_slots(p_trainer_id uuid, p_date date)
 RETURNS TABLE(session_type_id uuid, type_name text, type_color text, start_time time without time zone, duration_min integer, capacity integer, booked_count integer, is_canceled boolean, template_id uuid, waitlist_count integer, my_waitlist_id uuid, my_booking_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_weekday int;
  v_uid uuid := auth.uid();
BEGIN
  v_weekday := (EXTRACT(ISODOW FROM p_date)::int) - 1;

  RETURN QUERY
  WITH raspored AS (
    SELECT
      st.id AS session_type_id,
      st.name AS type_name,
      st.color AS type_color,
      sst.start_time,
      st.duration_min,
      st.capacity,
      sst.id AS template_id,
      COALESCE(sso.is_canceled, false) AS is_canceled,
      sso.start_time AS override_start
    FROM session_slot_templates sst
    JOIN session_types st ON st.id = sst.session_type_id
    LEFT JOIN session_slot_overrides sso
      ON sso.template_id = sst.id AND sso.date = p_date
    WHERE sst.trainer_id = p_trainer_id
      AND sst.weekday = v_weekday
      AND sst.is_active = true
      AND st.is_archived = false

    UNION ALL

    SELECT
      st.id,
      st.name,
      st.color,
      sso.start_time,
      st.duration_min,
      st.capacity,
      NULL::uuid,
      false,
      sso.start_time
    FROM session_slot_overrides sso
    JOIN session_types st ON st.id = sso.session_type_id
    WHERE sso.trainer_id = p_trainer_id
      AND sso.date = p_date
      AND sso.template_id IS NULL
      AND sso.is_canceled = false
      AND st.is_archived = false
  ),
  base AS (
    SELECT r.session_type_id, r.type_name, r.type_color, r.start_time, r.duration_min,
           r.capacity, r.template_id, r.is_canceled, r.override_start
    FROM raspored r

    UNION ALL

    -- Termini van rasporeda sa zauzetim mestima; naziv, boja i trajanje iz same rezervacije.
    SELECT
      sb.session_type_id,
      MAX(sb.type_name),
      MAX(sb.type_color),
      sb.start_time,
      MAX(sb.duration_min),
      MAX(sb.capacity),
      NULL::uuid,
      false,
      sb.start_time
    FROM session_bookings sb
    WHERE sb.trainer_id = p_trainer_id
      AND sb.date = p_date
      AND sb.status = 'booked'
      AND (v_uid = p_trainer_id OR sb.athlete_id = v_uid)
      AND NOT EXISTS (
        SELECT 1 FROM raspored r
         WHERE r.session_type_id = sb.session_type_id
           AND COALESCE(r.override_start, r.start_time) = sb.start_time
      )
    GROUP BY sb.session_type_id, sb.start_time
  )
  SELECT
    b.session_type_id,
    b.type_name,
    b.type_color,
    COALESCE(b.override_start, b.start_time) AS start_time,
    b.duration_min,
    b.capacity,
    COALESCE((
      SELECT COUNT(*)::int FROM session_bookings sb
      WHERE sb.trainer_id = p_trainer_id
        AND sb.date = p_date
        AND sb.start_time = COALESCE(b.override_start, b.start_time)
        AND sb.session_type_id = b.session_type_id
        AND sb.status = 'booked'
    ), 0) AS booked_count,
    b.is_canceled,
    b.template_id,
    COALESCE((
      SELECT COUNT(*)::int FROM session_waitlist w
      WHERE w.trainer_id = p_trainer_id
        AND w.date = p_date
        AND w.start_time = COALESCE(b.override_start, b.start_time)
        AND w.session_type_id = b.session_type_id
        AND w.status = 'waiting'
    ), 0) AS waitlist_count,
    (
      SELECT w.id FROM session_waitlist w
      WHERE w.trainer_id = p_trainer_id
        AND w.date = p_date
        AND w.start_time = COALESCE(b.override_start, b.start_time)
        AND w.session_type_id = b.session_type_id
        AND w.athlete_id = v_uid
        AND w.status = 'waiting'
      LIMIT 1
    ) AS my_waitlist_id,
    (
      SELECT sb.id FROM session_bookings sb
      WHERE sb.trainer_id = p_trainer_id
        AND sb.date = p_date
        AND sb.start_time = COALESCE(b.override_start, b.start_time)
        AND sb.session_type_id = b.session_type_id
        AND sb.athlete_id = v_uid
        AND sb.status = 'booked'
      LIMIT 1
    ) AS my_booking_id
  FROM base b
  ORDER BY 4;
END;
$function$;

-- _promote_waitlist: mesto koje se oslobodi u terminu koji vise nije u rasporedu ne sme da
-- upise sledeceg sa liste cekanja (i potrosi mu trening); oni koji cekaju se skidaju sa liste.
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
