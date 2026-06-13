-- Eksplicitno slanje plana vezbacu (trening + ishrana). Trener zove iz editora
-- dodeljenog plana (dugme "Posalji vezbacu"). Sada i OBJAVLJUJE plan
-- (published_at = COALESCE(published_at, now())) pa postaje vidljiv vezbacu, i
-- salje notifikaciju. Idempotentno: vraca false ako je notifikacija vec poslata.
-- Vec primenjeno na bazu preko MCP; ovaj fajl je samo za version control.

CREATE OR REPLACE FUNCTION public.notify_athlete_about_program(p_assigned_program_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_trainer_id uuid := auth.uid(); v_athlete_id uuid; v_name text; v_owner uuid; v_trainer_name text;
BEGIN
  IF v_trainer_id IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni'; END IF;
  SELECT athlete_id, name, trainer_id INTO v_athlete_id, v_name, v_owner
  FROM public.assigned_programs WHERE id = p_assigned_program_id;
  IF v_athlete_id IS NULL THEN RAISE EXCEPTION 'Plan ne postoji'; END IF;
  IF v_owner <> v_trainer_id THEN RAISE EXCEPTION 'Nije vas plan'; END IF;

  -- objavi (vidljiv vezbacu) ako jos nije
  UPDATE public.assigned_programs SET published_at = COALESCE(published_at, now())
  WHERE id = p_assigned_program_id;

  IF EXISTS (SELECT 1 FROM public.notifications
    WHERE kind = 'program_assigned' AND meta->>'assigned_program_id' = p_assigned_program_id::text) THEN
    RETURN false;
  END IF;

  SELECT COALESCE(p.full_name, 'Trener') INTO v_trainer_name
  FROM public.athletes a JOIN public.profiles p ON p.id = a.trainer_id WHERE a.id = v_athlete_id;

  INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
  VALUES (v_athlete_id, 'athlete', NULL, v_athlete_id, 'program_assigned',
    'Dobio si nov program', COALESCE(v_name, 'Program treninga') ||
      CASE WHEN v_trainer_name IS NOT NULL THEN ' • od ' || v_trainer_name ELSE '' END,
    jsonb_build_object('assigned_program_id', p_assigned_program_id, 'program_name', v_name));
  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_athlete_about_nutrition(p_assigned_plan_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_trainer_id uuid := auth.uid(); v_athlete_id uuid; v_name text; v_owner uuid; v_trainer_name text;
BEGIN
  IF v_trainer_id IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni'; END IF;
  SELECT athlete_id, name, trainer_id INTO v_athlete_id, v_name, v_owner
  FROM public.assigned_nutrition_plans WHERE id = p_assigned_plan_id;
  IF v_athlete_id IS NULL THEN RAISE EXCEPTION 'Plan ne postoji'; END IF;
  IF v_owner <> v_trainer_id THEN RAISE EXCEPTION 'Nije vas plan'; END IF;

  UPDATE public.assigned_nutrition_plans SET published_at = COALESCE(published_at, now())
  WHERE id = p_assigned_plan_id;

  IF EXISTS (SELECT 1 FROM public.notifications
    WHERE kind = 'nutrition_assigned' AND meta->>'assigned_plan_id' = p_assigned_plan_id::text) THEN
    RETURN false;
  END IF;

  SELECT COALESCE(p.full_name, 'Trener') INTO v_trainer_name
  FROM public.athletes a JOIN public.profiles p ON p.id = a.trainer_id WHERE a.id = v_athlete_id;

  INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
  VALUES (v_athlete_id, 'athlete', NULL, v_athlete_id, 'nutrition_assigned',
    'Dobio si plan ishrane', COALESCE(v_name, 'Plan ishrane') ||
      CASE WHEN v_trainer_name IS NOT NULL THEN ' • od ' || v_trainer_name ELSE '' END,
    jsonb_build_object('assigned_plan_id', p_assigned_plan_id, 'plan_name', v_name));
  RETURN true;
END;
$function$
;
