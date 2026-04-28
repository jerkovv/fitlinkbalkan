-- =====================================================================
-- 20_assign_program_rpc.sql
-- Robust RPC: assign_program_to_athlete(p_template_id, p_athlete_id)
-- - Snapshot kopija template-a u assigned_programs (+ days + exercises)
-- - Eksplicitne provere: trener mora da poseduje template I vežbača
-- - SECURITY DEFINER, search_path = public
-- - Vraća id novog assigned_programs reda
-- =====================================================================

CREATE OR REPLACE FUNCTION public.assign_program_to_athlete(
  p_template_id uuid,
  p_athlete_id  uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trainer_id     uuid := auth.uid();
  v_template_name  text;
  v_template_owner uuid;
  v_athlete_owner  uuid;
  v_assigned_id    uuid;
  v_day            record;
  v_new_day_id     uuid;
  v_days_count     int := 0;
BEGIN
  IF v_trainer_id IS NULL THEN
    RAISE EXCEPTION 'Niste prijavljeni';
  END IF;

  -- 1) Template mora postojati i pripadati ovom treneru
  SELECT name, trainer_id
    INTO v_template_name, v_template_owner
  FROM public.program_templates
  WHERE id = p_template_id;

  IF v_template_name IS NULL THEN
    RAISE EXCEPTION 'Program template ne postoji';
  END IF;

  IF v_template_owner <> v_trainer_id THEN
    RAISE EXCEPTION 'Nemate pristup ovom template-u';
  END IF;

  -- 2) Vežbač mora pripadati ovom treneru
  SELECT trainer_id INTO v_athlete_owner
  FROM public.athletes
  WHERE id = p_athlete_id;

  IF v_athlete_owner IS NULL THEN
    RAISE EXCEPTION 'Vežbač ne postoji';
  END IF;

  IF v_athlete_owner <> v_trainer_id THEN
    RAISE EXCEPTION 'Ovaj vežbač nije vaš';
  END IF;

  -- 3) Insert assigned_programs (snapshot root)
  INSERT INTO public.assigned_programs (athlete_id, trainer_id, name)
  VALUES (p_athlete_id, v_trainer_id, v_template_name)
  RETURNING id INTO v_assigned_id;

  -- 4) Kopiraj sve dane + njihove vežbe
  FOR v_day IN
    SELECT id, day_number, name
    FROM public.program_template_days
    WHERE template_id = p_template_id
    ORDER BY day_number
  LOOP
    INSERT INTO public.assigned_program_days (assigned_program_id, day_number, name)
    VALUES (v_assigned_id, v_day.day_number, v_day.name)
    RETURNING id INTO v_new_day_id;

    INSERT INTO public.assigned_program_exercises
      (day_id, exercise_id, position, sets, reps, weight_kg, rest_seconds)
    SELECT
      v_new_day_id,
      pte.exercise_id,
      pte.position,
      pte.sets,
      pte.reps,
      pte.weight_kg,
      pte.rest_seconds
    FROM public.program_template_exercises pte
    WHERE pte.day_id = v_day.id
    ORDER BY pte.position;

    v_days_count := v_days_count + 1;
  END LOOP;

  IF v_days_count = 0 THEN
    -- Snapshot bez ijednog dana je beskorisan — rollback
    RAISE EXCEPTION 'Template nema nijedan dan. Dodaj bar jedan dan pre dodele.';
  END IF;

  RETURN v_assigned_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_program_to_athlete(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_program_to_athlete(uuid, uuid) TO authenticated;
