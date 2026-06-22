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
    INSERT INTO public.assigned_program_exercises (day_id, exercise_id, position, sets, reps, weight_kg, rest_seconds, duration_minutes)
    SELECT v_new_day_id, pte.exercise_id, pte.position, pte.sets, pte.reps, pte.weight_kg, pte.rest_seconds, pte.duration_minutes
    FROM public.program_template_exercises pte WHERE pte.day_id = v_day.id ORDER BY pte.position;
    v_days_count := v_days_count + 1;
  END LOOP;
  IF v_days_count = 0 THEN RAISE EXCEPTION 'Template nema nijedan dan. Dodaj bar jedan dan pre dodele.'; END IF;
  RETURN v_assigned_id;
END;
$function$;

-- prekopiraj trajanje u POSTOJECE dodeljene programe (kardio vezbe sa praznim trajanjem)
UPDATE public.assigned_program_exercises ape
SET duration_minutes = (
  SELECT pte.duration_minutes
  FROM public.program_template_exercises pte
  JOIN public.program_template_days ptd ON ptd.id = pte.day_id
  JOIN public.assigned_program_days apd ON apd.id = ape.day_id
  JOIN public.assigned_programs ap ON ap.id = apd.assigned_program_id
  WHERE pte.exercise_id = ape.exercise_id
    AND ptd.template_id = ap.source_template_id
    AND ptd.day_number = apd.day_number
    AND pte.position = ape.position
  LIMIT 1
)
WHERE ape.duration_minutes IS NULL
  AND ape.exercise_id IN (SELECT id FROM public.exercises WHERE is_duration_based);
