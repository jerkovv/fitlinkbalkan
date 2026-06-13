-- Custom plan treninga od nule (bez sablona).
-- Trener pravi prazan dodeljeni plan direktno za vezbaca; postaje tekuci jer je
-- najnoviji assigned_at. Vraca id novog assigned_programs reda. SECURITY DEFINER
-- uz proveru da je vezbac trenerov (auth.uid()).
-- Vec primenjeno na bazu preko MCP; ovaj fajl je samo za version control.

CREATE OR REPLACE FUNCTION public.create_custom_assigned_program(p_athlete_id uuid, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trainer_id uuid := auth.uid();
  v_athlete_owner uuid;
  v_assigned_id uuid;
BEGIN
  IF v_trainer_id IS NULL THEN
    RAISE EXCEPTION 'Niste prijavljeni';
  END IF;

  SELECT trainer_id INTO v_athlete_owner FROM public.athletes WHERE id = p_athlete_id;
  IF v_athlete_owner IS NULL THEN
    RAISE EXCEPTION 'Vezbac ne postoji';
  END IF;
  IF v_athlete_owner <> v_trainer_id THEN
    RAISE EXCEPTION 'Ovaj vezbac nije vas';
  END IF;

  INSERT INTO public.assigned_programs (athlete_id, trainer_id, name, source_template_id)
  VALUES (p_athlete_id, v_trainer_id, COALESCE(NULLIF(trim(p_name), ''), 'Novi plan'), NULL)
  RETURNING id INTO v_assigned_id;

  RETURN v_assigned_id;
END;
$function$
;
