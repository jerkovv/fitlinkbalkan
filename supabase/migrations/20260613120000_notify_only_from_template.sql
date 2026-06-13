-- Notifikacija o dodeljenom planu se salje SAMO kad plan dolazi iz sablona
-- (source_template_id NOT NULL). Custom plan (od nule) se kreira prazan i tih;
-- trener ga eksplicitno objavi/posalje preko notify_athlete_about_* kad zavrsi.
-- assign_program_to_athlete sada postavlja published_at = now() (sablon je odmah objavljen).
-- Vec primenjeno na bazu preko MCP; ovaj fajl je samo za version control.

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
    INSERT INTO public.assigned_program_exercises (day_id, exercise_id, position, sets, reps, weight_kg, rest_seconds)
    SELECT v_new_day_id, pte.exercise_id, pte.position, pte.sets, pte.reps, pte.weight_kg, pte.rest_seconds
    FROM public.program_template_exercises pte WHERE pte.day_id = v_day.id ORDER BY pte.position;
    v_days_count := v_days_count + 1;
  END LOOP;
  IF v_days_count = 0 THEN RAISE EXCEPTION 'Template nema nijedan dan. Dodaj bar jedan dan pre dodele.'; END IF;
  RETURN v_assigned_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_program_assigned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_trainer_name text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Custom plan (bez sablona) se kreira prazan -> ne salji odmah.
  -- Notifikacija ide eksplicitno preko notify_athlete_about_program kad trener zavrsi.
  IF NEW.source_template_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.full_name, 'Trener') INTO v_trainer_name
  FROM public.athletes a JOIN public.profiles p ON p.id = a.trainer_id
  WHERE a.id = NEW.athlete_id;

  INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
  VALUES (NEW.athlete_id, 'athlete', NULL, NEW.athlete_id, 'program_assigned',
    'Dobio si nov program', COALESCE(NEW.name, 'Program treninga') ||
      CASE WHEN v_trainer_name IS NOT NULL THEN ' • od ' || v_trainer_name ELSE '' END,
    jsonb_build_object('assigned_program_id', NEW.id, 'program_name', NEW.name));
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_nutrition_assigned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_trainer_name text;
BEGIN
  IF NEW.source_template_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.full_name, 'Trener') INTO v_trainer_name
  FROM public.athletes a JOIN public.profiles p ON p.id = a.trainer_id
  WHERE a.id = NEW.athlete_id;

  INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
  VALUES (NEW.athlete_id, 'athlete', NULL, NEW.athlete_id, 'nutrition_assigned',
    'Dobio si plan ishrane', COALESCE(NEW.name, 'Plan ishrane') ||
      CASE WHEN v_trainer_name IS NOT NULL THEN ' • od ' || v_trainer_name ELSE '' END,
    jsonb_build_object('assigned_plan_id', NEW.id, 'plan_name', NEW.name));
  RETURN NEW;
END;
$function$
;
