-- Uvek tacno jedan plan ishrane po vezbacu (bez gomilanja); za trening se brisu
-- samo nacrti (published_at NULL), poslati programi se cuvaju zbog workout istorije.
-- Vec primenjeno na bazu preko MCP; ovaj fajl je samo za version control.

CREATE OR REPLACE FUNCTION public.create_custom_assigned_nutrition_plan(p_athlete_id uuid, p_name text)
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

  -- ne gomilaj nacrte: ukloni ranije nacrte ishrane (published_at NULL); poslat plan ostaje netaknut
  DELETE FROM public.assigned_nutrition_plans
  WHERE athlete_id = p_athlete_id AND published_at IS NULL;

  INSERT INTO public.assigned_nutrition_plans (athlete_id, trainer_id, name, source_template_id, is_active)
  VALUES (p_athlete_id, v_trainer_id, COALESCE(NULLIF(trim(p_name), ''), 'Novi plan ishrane'), NULL, true)
  RETURNING id INTO v_assigned_id;

  RETURN v_assigned_id;
END;
$function$
;

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

  -- ne gomilaj nacrte: ukloni ranije nacrte treninga (published_at NULL); poslati programi (istorija) ostaju
  DELETE FROM public.assigned_programs
  WHERE athlete_id = p_athlete_id AND published_at IS NULL;

  INSERT INTO public.assigned_programs (athlete_id, trainer_id, name, source_template_id)
  VALUES (p_athlete_id, v_trainer_id, COALESCE(NULLIF(trim(p_name), ''), 'Novi plan'), NULL)
  RETURNING id INTO v_assigned_id;

  RETURN v_assigned_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.assign_nutrition_plan_to_athlete(p_template_id uuid, p_athlete_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_assigned_id uuid; v_trainer_id uuid; v_day_map jsonb := '{}'::jsonb;
  v_day RECORD; v_new_day_id uuid; v_meal RECORD; v_new_meal_id uuid; v_sched RECORD;
BEGIN
  SELECT trainer_id INTO v_trainer_id FROM nutrition_plan_templates WHERE id = p_template_id;
  IF v_trainer_id IS NULL OR v_trainer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  -- dodeljivanje iz sablona je ODMAH objavljeno (published_at = now())
  INSERT INTO assigned_nutrition_plans (athlete_id, trainer_id, source_template_id, name, goal, target_kcal, target_protein, target_carbs, target_fat, notes, published_at)
  SELECT p_athlete_id, trainer_id, id, name, goal, target_kcal, target_protein, target_carbs, target_fat, notes, now()
  FROM nutrition_plan_templates WHERE id = p_template_id
  RETURNING id INTO v_assigned_id;

  FOR v_day IN SELECT * FROM nutrition_plan_days WHERE template_id = p_template_id ORDER BY day_number LOOP
    INSERT INTO assigned_nutrition_days (assigned_plan_id, day_number, name)
    VALUES (v_assigned_id, v_day.day_number, v_day.name) RETURNING id INTO v_new_day_id;
    v_day_map := v_day_map || jsonb_build_object(v_day.id::text, v_new_day_id::text);

    FOR v_meal IN SELECT * FROM nutrition_plan_meals WHERE day_id = v_day.id ORDER BY meal_order LOOP
      INSERT INTO assigned_nutrition_meals (day_id, meal_order, name, time_hint)
      VALUES (v_new_day_id, v_meal.meal_order, v_meal.name, v_meal.time_hint) RETURNING id INTO v_new_meal_id;
      INSERT INTO assigned_nutrition_meal_items (meal_id, food_id, grams, item_order)
      SELECT v_new_meal_id, food_id, grams, item_order FROM nutrition_plan_meal_items WHERE meal_id = v_meal.id;
    END LOOP;
  END LOOP;

  FOR v_sched IN SELECT * FROM nutrition_plan_week_schedule WHERE template_id = p_template_id LOOP
    INSERT INTO assigned_nutrition_week_schedule (assigned_plan_id, weekday, day_id)
    VALUES (v_assigned_id, v_sched.weekday, (v_day_map->>v_sched.day_id::text)::uuid);
  END LOOP;

  -- uvek tacno jedan plan ishrane: ovaj novi je jedini, ukloni sve ostale (stari poslat + eventualni nacrt)
  DELETE FROM assigned_nutrition_plans
  WHERE athlete_id = p_athlete_id AND id <> v_assigned_id;

  RETURN v_assigned_id;
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

  -- prvi put kad se salje: ovaj plan postaje jedini plan ishrane, ukloni sve ostale (stari poslat + nacrti)
  DELETE FROM public.assigned_nutrition_plans
  WHERE athlete_id = v_athlete_id AND id <> p_assigned_plan_id;

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
