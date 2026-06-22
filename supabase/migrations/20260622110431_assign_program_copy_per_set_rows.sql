CREATE OR REPLACE FUNCTION public.assign_program_to_athlete(p_template_id uuid, p_athlete_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trainer_id uuid := auth.uid();
  v_template_name text; v_template_owner uuid; v_athlete_owner uuid;
  v_assigned_id uuid; v_day record; v_new_day_id uuid; v_days_count int := 0;
  v_ex record; v_new_ex_id uuid;
BEGIN
  IF v_trainer_id IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni'; END IF;
  SELECT name, trainer_id INTO v_template_name, v_template_owner
  FROM public.program_templates WHERE id = p_template_id;
  IF v_template_name IS NULL THEN RAISE EXCEPTION 'Program template ne postoji'; END IF;
  IF v_template_owner <> v_trainer_id THEN RAISE EXCEPTION 'Nemate pristup ovom template-u'; END IF;
  SELECT trainer_id INTO v_athlete_owner FROM public.athletes WHERE id = p_athlete_id;
  IF v_athlete_owner IS NULL THEN RAISE EXCEPTION 'Vezbac ne postoji'; END IF;
  IF v_athlete_owner <> v_trainer_id THEN RAISE EXCEPTION 'Ovaj vezbac nije vas'; END IF;

  INSERT INTO public.assigned_programs (athlete_id, trainer_id, name, source_template_id, published_at)
  VALUES (p_athlete_id, v_trainer_id, v_template_name, p_template_id, now())
  RETURNING id INTO v_assigned_id;

  FOR v_day IN SELECT id, day_number, name FROM public.program_template_days
    WHERE template_id = p_template_id ORDER BY day_number
  LOOP
    INSERT INTO public.assigned_program_days (assigned_program_id, day_number, name)
    VALUES (v_assigned_id, v_day.day_number, v_day.name) RETURNING id INTO v_new_day_id;

    FOR v_ex IN SELECT id, exercise_id, position, sets, reps, weight_kg, rest_seconds, duration_minutes
      FROM public.program_template_exercises WHERE day_id = v_day.id ORDER BY position
    LOOP
      INSERT INTO public.assigned_program_exercises
        (day_id, exercise_id, position, sets, reps, weight_kg, rest_seconds, duration_minutes)
      VALUES
        (v_new_day_id, v_ex.exercise_id, v_ex.position, v_ex.sets, v_ex.reps, v_ex.weight_kg, v_ex.rest_seconds, v_ex.duration_minutes)
      RETURNING id INTO v_new_ex_id;

      INSERT INTO public.assigned_program_exercise_sets
        (assigned_exercise_id, set_number, reps, weight_kg, rest_seconds, notes)
      SELECT v_new_ex_id, s.set_number, s.reps, s.weight_kg, s.rest_seconds, s.notes
      FROM public.program_template_exercise_sets s
      WHERE s.template_exercise_id = v_ex.id
      ORDER BY s.set_number;
    END LOOP;

    v_days_count := v_days_count + 1;
  END LOOP;
  IF v_days_count = 0 THEN RAISE EXCEPTION 'Template nema nijedan dan. Dodaj bar jedan dan pre dodele.'; END IF;
  RETURN v_assigned_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.assign_program_to_athlete(uuid, uuid) TO authenticated, service_role;
