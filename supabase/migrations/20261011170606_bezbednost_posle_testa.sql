-- Bezbednosne rupe i dva kvara koje je nasao test pre izdanja (2026-10-11).
-- Sve vazi i za aplikaciju iz prodavnice, jer deli isti server.

-- 1) Registracija: uloga samo trener ili vezbac; pozivnica mejlom ostaje otvorena dok
--    je vezbac ne prihvati.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _role public.app_role;
  v_code text;
  v_trainer uuid := null;
  v_invite_id uuid := null;
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));

  -- Uloga iz podataka registracije sme da bude samo trener ili vezbac. Ranije se uzimala
  -- kako je poslata, pa je registracija sa role = admin pravila admin nalog.
  _role := case when new.raw_user_meta_data->>'role' = 'trainer'
                then 'trainer'::public.app_role else 'athlete'::public.app_role end;
  insert into public.user_roles (user_id, role) values (new.id, _role);

  if _role = 'trainer' then
    insert into public.trainers (id, invite_code)
      values (new.id, lpad((floor(random()*100000))::text, 5, '0'));
    return new;
  end if;

  v_code := nullif(btrim(coalesce(new.raw_user_meta_data->>'invite_code', '')), '');

  if v_code is not null then
    begin
      select i.id, i.trainer_id
        into v_invite_id, v_trainer
      from public.invites i
      where lower(i.code) = lower(v_code)
        and i.status = 'pending'
        and (i.expires_at is null or i.expires_at > now())
      order by i.created_at desc
      limit 1;

      if v_trainer is null then
        select t.id
          into v_trainer
        from public.trainers t
        where t.invite_code = v_code
        limit 1;
      end if;
    exception when others then
      v_trainer := null;
      v_invite_id := null;
    end;
  end if;

  insert into public.athletes (id, trainer_id) values (new.id, v_trainer);

  -- Nalog koji pravi trenerov poziv mejlom jos nema lozinku: vezbac se tek registruje, pa
  -- pozivnica ostaje otvorena dok je on sam ne prihvati (accept_invite). Ranije je ovde
  -- odmah oznacavana kao iskoriscena, pa ga je ekran sa kodom odbijao.
  if v_invite_id is not null and coalesce(new.encrypted_password, '') <> '' then
    update public.invites
       set status = 'accepted',
           used_by = new.id
     where id = v_invite_id;
  end if;

  return new;
end $function$;

-- 2) Pozivnice je citao svako ko je prijavljen (mejl, ime i kod svih pozvanih). Sada
--    vezbac vidi samo pozivnice na svoj mejl; trener svoje vidi kroz invites_trainer_manage.
DROP POLICY IF EXISTS invites_read_authenticated ON public.invites;
CREATE POLICY invites_read_own ON public.invites FOR SELECT TO authenticated
  USING (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) OR used_by = auth.uid());

-- 3) Vezbac je mogao da upise bilo kog trenera u svoj red (athletes_self_update nema proveru),
--    a trener da svog vezbaca prepise drugom treneru. Ostaju "athlete updates own row"
--    (trener se ne menja) i trainer_can_unassign_own_athlete; veza sa trenerom ide kroz accept_invite.
DROP POLICY IF EXISTS athletes_self_update ON public.athletes;
DROP POLICY IF EXISTS athletes_trainer_assign ON public.athletes;

-- Provere svih politika za izmenu se sabiraju (dovoljno je da jedna prodje), pa je
-- trenerova "trener ili prazno" pustala i vezbaca da sam sebi obrise trenera. Trenerova
-- provera sada vazi samo za tudje redove, a vezbaceva radi i kad trenera nema.
DROP POLICY IF EXISTS trainer_can_unassign_own_athlete ON public.athletes;
CREATE POLICY trainer_can_unassign_own_athlete ON public.athletes FOR UPDATE
  USING (trainer_id = auth.uid())
  WITH CHECK (id <> auth.uid() AND (trainer_id = auth.uid() OR trainer_id IS NULL));

DROP POLICY IF EXISTS "athlete updates own row" ON public.athletes;
CREATE POLICY "athlete updates own row" ON public.athletes FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND trainer_id IS NOT DISTINCT FROM
              (SELECT a.trainer_id FROM public.athletes a WHERE a.id = auth.uid()));

-- 4) Prekid treninga je brisao serije BILO KOJE sesije, i bez prijave.
CREATE OR REPLACE FUNCTION public.cancel_workout_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    return;
  end if;

  -- Serije se brisu samo za sesiju koja pripada onome ko zove.
  delete from public.set_logs sl
   using public.workout_session_logs s
  where sl.session_log_id = p_session_id
    and s.id = sl.session_log_id
    and s.athlete_id = auth.uid();

  delete from public.workout_session_logs
  where id = p_session_id and athlete_id = auth.uid();
end $function$;
REVOKE EXECUTE ON FUNCTION public.cancel_workout_session(uuid) FROM PUBLIC, anon;

-- 5) Zivo stanje treninga (puls, id sesije, znak za Live Activity) citalo se bez prijave.
--    Sat ga cita kroz watch_poll_state sa svojim nalogom, pa gostu pristup ne treba.
DROP POLICY IF EXISTS wls_anon_realtime_select ON public.workout_live_state;
REVOKE ALL ON public.workout_live_state FROM anon;
REVOKE EXECUTE ON FUNCTION public.watch_compute_position(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_next_workout_day(p_athlete_id uuid)
 RETURNS TABLE(assigned_program_id uuid, program_name text, day_id uuid, day_number integer, day_name text, total_days integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_program_id uuid; v_total_days int; v_last_day int; v_next_day int;
BEGIN
  -- Samo vezbac za sebe, njegov trener ili admin. Bez prijave funkcija se zove jos samo
  -- iznutra, iz drugih funkcija (pravo izvrsavanja je oduzeto gostu).
  IF auth.uid() IS NOT NULL AND NOT (auth.uid() = p_athlete_id
       OR public.is_my_athlete(auth.uid(), p_athlete_id) OR public.is_admin()) THEN
    RETURN;
  END IF;

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

  -- Sledeci POSTOJECI dan posle poslednjeg odradjenog, inace prvi postojeci. Ranije se
  -- racunalo (poslednji % broj_dana) + 1, pa je posle brisanja dana koji nije poslednji
  -- trazen broj dana koji ne postoji i vezbacu je plan nestajao.
  SELECT MIN(apd.day_number) INTO v_next_day
  FROM public.assigned_program_days apd
  WHERE apd.assigned_program_id = v_program_id AND apd.deleted_at IS NULL
    AND apd.day_number > COALESCE(v_last_day, -2147483648);
  IF v_next_day IS NULL THEN
    SELECT MIN(apd.day_number) INTO v_next_day
    FROM public.assigned_program_days apd
    WHERE apd.assigned_program_id = v_program_id AND apd.deleted_at IS NULL;
  END IF;

  RETURN QUERY
  SELECT ap.id, ap.name, apd.id, apd.day_number, apd.name, v_total_days
  FROM public.assigned_programs ap
  JOIN public.assigned_program_days apd ON apd.assigned_program_id = ap.id
  WHERE ap.id = v_program_id AND apd.deleted_at IS NULL AND apd.day_number = v_next_day;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_next_workout_day(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.get_athlete_streak(p_athlete_id uuid)
 RETURNS TABLE(current_streak_days integer, longest_streak_days integer, weeks_streak integer, total_workouts integer, last_workout_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Belgrade')::date;
  v_current int := 0;
  v_longest int := 0;
  v_run int := 0;
  v_prev date := NULL;
  v_total int := 0;
  v_last timestamptz;
  v_weeks int := 0;
  v_prev_week date := NULL;
  r record;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (auth.uid() = p_athlete_id
       OR public.is_my_athlete(auth.uid(), p_athlete_id) OR public.is_admin()) THEN
    RETURN;
  END IF;

  -- jedinstveni dani treninga (lokalni datum BG)
  FOR r IN
    SELECT DISTINCT (completed_at AT TIME ZONE 'Europe/Belgrade')::date AS d
    FROM public.workout_session_logs
    WHERE athlete_id = p_athlete_id
      AND completed_at IS NOT NULL
    ORDER BY d
  LOOP
    IF v_prev IS NULL OR r.d - v_prev = 1 THEN
      v_run := v_run + 1;
    ELSIF r.d = v_prev THEN
      -- isti dan (ne bi trebalo zbog DISTINCT, ali safe)
      NULL;
    ELSE
      v_run := 1;
    END IF;
    IF v_run > v_longest THEN v_longest := v_run; END IF;
    v_prev := r.d;
  END LOOP;

  -- current streak: računa od danas ili juče (gap od max 1 dan dozvoljen)
  IF v_prev IS NOT NULL AND (v_today - v_prev) <= 1 THEN
    v_current := v_run;
  ELSE
    v_current := 0;
  END IF;

  -- weeks streak: uzastopne ISO nedelje sa ≥1 treningom, do ove nedelje (ili prošle)
  v_run := 0;
  FOR r IN
    SELECT DISTINCT date_trunc('week', completed_at AT TIME ZONE 'Europe/Belgrade')::date AS w
    FROM public.workout_session_logs
    WHERE athlete_id = p_athlete_id
      AND completed_at IS NOT NULL
    ORDER BY w
  LOOP
    IF v_prev_week IS NULL OR r.w - v_prev_week = 7 THEN
      v_run := v_run + 1;
    ELSE
      v_run := 1;
    END IF;
    v_prev_week := r.w;
  END LOOP;

  IF v_prev_week IS NOT NULL
     AND (date_trunc('week', v_today)::date - v_prev_week) <= 7 THEN
    v_weeks := v_run;
  ELSE
    v_weeks := 0;
  END IF;

  -- Ukupno je broj SESIJA, ne dana: dva treninga istog dana su dva treninga.
  SELECT count(*), MAX(completed_at) INTO v_total, v_last
  FROM public.workout_session_logs
  WHERE athlete_id = p_athlete_id AND completed_at IS NOT NULL;

  RETURN QUERY SELECT v_current, v_longest, v_weeks, v_total, v_last;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_athlete_streak(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.get_athlete_last_workout(p_athlete_id uuid)
 RETURNS TABLE(last_workout_at timestamp with time zone, days_inactive integer, has_active_program boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT MAX(completed_at) FROM public.workout_session_logs
       WHERE athlete_id = p_athlete_id AND completed_at IS NOT NULL) AS last_workout_at,
    GREATEST(0, EXTRACT(DAY FROM (NOW() - COALESCE(
      (SELECT MAX(completed_at) FROM public.workout_session_logs
        WHERE athlete_id = p_athlete_id AND completed_at IS NOT NULL),
      (SELECT joined_at FROM public.athletes WHERE id = p_athlete_id)
    )))::int) AS days_inactive,
    EXISTS(
      SELECT 1 FROM public.assigned_programs
      WHERE athlete_id = p_athlete_id AND COALESCE(is_active, true) = true
    ) AS has_active_program
  WHERE auth.uid() IS NULL OR auth.uid() = p_athlete_id
     OR public.is_my_athlete(auth.uid(), p_athlete_id) OR public.is_admin();
$function$;
REVOKE EXECUTE ON FUNCTION public.get_athlete_last_workout(uuid) FROM PUBLIC, anon;

-- 6) Plan ishrane je mogao da se dodeli tudjem vezbacu ili podmetne kroz tabelu.
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
  PERFORM public.require_active_trainer_sub();
  SELECT trainer_id INTO v_trainer_id FROM nutrition_plan_templates WHERE id = p_template_id;
  IF v_trainer_id IS NULL OR v_trainer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  -- Plan se dodeljuje samo svom vezbacu (isto pravilo kao assign_program_to_athlete).
  IF NOT public.is_my_athlete(auth.uid(), p_athlete_id) THEN RAISE EXCEPTION 'Ovaj vežbač nije vaš'; END IF;

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
$function$;

DROP POLICY IF EXISTS "Trainer manages assigned plans" ON public.assigned_nutrition_plans;
CREATE POLICY "Trainer manages assigned plans" ON public.assigned_nutrition_plans FOR ALL TO authenticated
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid() AND public.is_my_athlete(auth.uid(), athlete_id));

DROP POLICY IF EXISTS "Trainer views athlete logs" ON public.nutrition_logs;
CREATE POLICY "Trainer views athlete logs" ON public.nutrition_logs FOR SELECT TO authenticated
  USING (public.is_my_athlete(auth.uid(), nutrition_logs.athlete_id)
         AND EXISTS (SELECT 1 FROM public.assigned_nutrition_plans p
                      WHERE p.athlete_id = nutrition_logs.athlete_id AND p.trainer_id = auth.uid()));

-- 7) Clanarina je mogla da se napravi mimo kupovine: vezbac se upise kao trener pa sam sebi,
--    ili trener tudjem vezbacu.
DROP POLICY IF EXISTS memberships_trainer_manage ON public.memberships;
CREATE POLICY memberships_trainer_manage ON public.memberships FOR ALL
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid() AND public.is_my_athlete(auth.uid(), athlete_id));

DROP POLICY IF EXISTS trainers_self_insert ON public.trainers;
CREATE POLICY trainers_self_insert ON public.trainers FOR INSERT
  WITH CHECK (id = auth.uid() AND public.has_role(auth.uid(), 'trainer'::public.app_role));

-- 8) Zdravstveni podaci su mogli da se upisu u tudj nalog (politika ostala iz debagovanja).
DROP POLICY IF EXISTS wd_insert_debug ON public.wearable_data;
CREATE POLICY wd_insert_self ON public.wearable_data FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
