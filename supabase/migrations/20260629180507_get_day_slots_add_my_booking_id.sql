-- Add my_booking_id (caller's own 'booked' booking id for the slot, null if cancelled/absent).
-- Fixes the cancel bug: UI showed "Rezervisano" for slots where the caller's booking was actually
-- cancelled, then cancel_session_booking failed because no 'booked' row matched.
drop function if exists public.get_day_slots(uuid, date);

create function public.get_day_slots(p_trainer_id uuid, p_date date)
returns table(
  session_type_id uuid,
  type_name text,
  type_color text,
  start_time time without time zone,
  duration_min integer,
  capacity integer,
  booked_count integer,
  is_canceled boolean,
  template_id uuid,
  waitlist_count integer,
  my_waitlist_id uuid,
  my_booking_id uuid
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
DECLARE
  v_weekday int;
  v_uid uuid := auth.uid();
BEGIN
  v_weekday := (EXTRACT(ISODOW FROM p_date)::int) - 1;

  RETURN QUERY
  WITH base AS (
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

grant execute on function public.get_day_slots(uuid, date) to anon, authenticated, service_role;
