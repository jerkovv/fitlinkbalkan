-- Plan napravljen od nule i poslat POSLE dodele sablona nije stizao do vezbaca:
-- objava je upisivala samo published_at, a tekuci program se bira po assigned_at.
CREATE OR REPLACE FUNCTION public.notify_athlete_about_program(p_assigned_program_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_trainer_id uuid := auth.uid(); v_athlete_id uuid; v_name text; v_owner uuid; v_trainer_name text;
BEGIN
  PERFORM public.require_active_trainer_sub();
  IF v_trainer_id IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni'; END IF;
  SELECT athlete_id, name, trainer_id INTO v_athlete_id, v_name, v_owner
  FROM public.assigned_programs WHERE id = p_assigned_program_id;
  IF v_athlete_id IS NULL THEN RAISE EXCEPTION 'Plan ne postoji'; END IF;
  IF v_owner <> v_trainer_id THEN RAISE EXCEPTION 'Nije vas plan'; END IF;

  -- objavi (vidljiv vezbacu) ako jos nije.
  -- Pri prvoj objavi i assigned_at postaje sada: tekuci program se svuda bira po
  -- assigned_at (get_next_workout_day, profil vezbaca kod trenera), pa plan od nule
  -- zapocet pre dodele sablona inace nikad ne bi stigao do vezbaca iako je poslat.
  UPDATE public.assigned_programs
  SET assigned_at = CASE WHEN published_at IS NULL THEN now() ELSE assigned_at END,
      published_at = COALESCE(published_at, now())
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

-- Vec poslati planovi sa istom greskom: datum dodele se ravna sa datumom slanja.
UPDATE public.assigned_programs SET assigned_at = published_at
 WHERE published_at IS NOT NULL AND published_at > assigned_at;

