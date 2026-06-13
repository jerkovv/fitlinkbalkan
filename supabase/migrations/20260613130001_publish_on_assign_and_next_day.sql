-- Dodela plana ishrane iz sablona je ODMAH objavljena (published_at = now()), kao
-- i kod programa. get_next_workout_day prikazuje vezbacu samo OBJAVLJEN tekuci
-- program (published_at IS NOT NULL) pa draft custom plan ne procuri.
-- Vec primenjeno na bazu preko MCP; ovaj fajl je samo za version control.

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

  RETURN v_assigned_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_next_workout_day(p_athlete_id uuid)
 RETURNS TABLE(assigned_program_id uuid, program_name text, day_id uuid, day_number integer, day_name text, total_days integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_program_id uuid; v_total_days int; v_last_day int; v_next_day int;
BEGIN
  SELECT ap.id INTO v_program_id
  FROM public.assigned_programs ap
  WHERE ap.athlete_id = p_athlete_id
    AND ap.published_at IS NOT NULL
  ORDER BY ap.assigned_at DESC LIMIT 1;

  IF v_program_id IS NULL THEN RETURN; END IF;

  SELECT COUNT(*)::int INTO v_total_days
  FROM public.assigned_program_days apd
  WHERE apd.assigned_program_id = v_program_id AND apd.deleted_at IS NULL;
  IF v_total_days = 0 THEN RETURN; END IF;

  SELECT wsl.day_number INTO v_last_day
  FROM public.workout_session_logs wsl
  WHERE wsl.athlete_id = p_athlete_id AND wsl.assigned_program_id = v_program_id
    AND wsl.completed_at IS NOT NULL
  ORDER BY wsl.completed_at DESC LIMIT 1;

  v_next_day := COALESCE((v_last_day % v_total_days) + 1, 1);

  RETURN QUERY
  SELECT ap.id, ap.name, apd.id, apd.day_number, apd.name, v_total_days
  FROM public.assigned_programs ap
  JOIN public.assigned_program_days apd ON apd.assigned_program_id = ap.id
  WHERE ap.id = v_program_id AND apd.deleted_at IS NULL AND apd.day_number = v_next_day;
END;
$function$
;
