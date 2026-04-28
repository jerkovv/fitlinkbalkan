-- 18_show_attendees_setting.sql
-- Trener bira da li vežbači mogu da vide ko je još rezervisao isti termin.
-- - Default: false (samo broj, kao i sad)
-- - Kad je uključeno, vežbač pozove RPC i dobije listu imena drugih vežbača iz IST-og termina
-- Pokreni u Supabase SQL Editoru.

-- 1) Setting na trainers
ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS show_attendees_to_athletes boolean NOT NULL DEFAULT false;

-- 2) RPC: vežbač traži listu učesnika za određeni slot kod svog trenera
CREATE OR REPLACE FUNCTION public.get_slot_attendees(
  p_trainer_id      uuid,
  p_date            date,
  p_start_time      time,
  p_session_type_id uuid
)
RETURNS TABLE (
  athlete_id uuid,
  full_name  text,
  is_me      boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  SELECT b.athlete_id,
         COALESCE(NULLIF(TRIM(p.full_name), ''), 'Vežbač') AS full_name,
         (b.athlete_id = v_uid) AS is_me
    FROM public.session_bookings b
    LEFT JOIN public.profiles p ON p.id = b.athlete_id
   WHERE b.trainer_id = p_trainer_id
     AND b.date = p_date
     AND b.start_time = p_start_time
     AND b.session_type_id = p_session_type_id
     AND b.status = 'booked'
   ORDER BY (b.athlete_id = v_uid) DESC, full_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_slot_attendees(uuid, date, time, uuid) TO authenticated;
