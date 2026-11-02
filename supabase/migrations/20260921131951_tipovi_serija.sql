-- Tip serije (zagrevanje, do otkaza, drop set...) bira samo trener, u programu
-- pre treninga ili uzivo tokom treninga. NULL je obicna serija.
-- Tip stoji na planiranoj seriji; racvanje sesije i dodela programa ga prenose,
-- a svaka funkcija koja vraca per-set ciljeve ga vraca kao 'set_type'.

ALTER TABLE public.program_template_exercise_sets
  ADD COLUMN IF NOT EXISTS set_type text;
ALTER TABLE public.assigned_program_exercise_sets
  ADD COLUMN IF NOT EXISTS set_type text;

ALTER TABLE public.program_template_exercise_sets
  DROP CONSTRAINT IF EXISTS program_template_exercise_sets_set_type_check;
ALTER TABLE public.program_template_exercise_sets
  ADD CONSTRAINT program_template_exercise_sets_set_type_check CHECK (
    set_type IS NULL OR set_type IN ('warmup','failure','drop','left','right','negative',
                                     'partial','myo','feeder','top','backoff'));
ALTER TABLE public.assigned_program_exercise_sets
  DROP CONSTRAINT IF EXISTS assigned_program_exercise_sets_set_type_check;
ALTER TABLE public.assigned_program_exercise_sets
  ADD CONSTRAINT assigned_program_exercise_sets_set_type_check CHECK (
    set_type IS NULL OR set_type IN ('warmup','failure','drop','left','right','negative',
                                     'partial','myo','feeder','top','backoff'));

-- ---------------------------------------------------------------------------
-- Cuvanje serija iz editora programa. Klijent koji ne salje 'set_type' (verzija
-- iz prodavnice) zadrzava tip koji serija na tom mestu vec ima.
CREATE OR REPLACE FUNCTION public.save_exercise_sets(p_scope text, p_exercise_id uuid, p_sets jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_n int;
  v_first_reps text;
  v_first_weight numeric;
  v_owner_ok boolean := false;
BEGIN
  PERFORM public.require_active_trainer_sub();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni'; END IF;
  IF p_scope NOT IN ('template','assigned') THEN RAISE EXCEPTION 'Nepoznat scope'; END IF;
  IF jsonb_typeof(p_sets) <> 'array' THEN RAISE EXCEPTION 'p_sets mora biti niz'; END IF;

  v_n := jsonb_array_length(p_sets);
  IF v_n < 1 THEN RAISE EXCEPTION 'Mora postojati bar jedan set'; END IF;

  -- vlasnistvo + grananje po modu
  IF p_scope = 'template' THEN
    SELECT true INTO v_owner_ok
    FROM public.program_template_exercises pte
    JOIN public.program_template_days d ON d.id = pte.day_id
    JOIN public.program_templates t ON t.id = d.template_id
    WHERE pte.id = p_exercise_id AND t.trainer_id = v_uid;
    IF NOT coalesce(v_owner_ok,false) THEN RAISE EXCEPTION 'Nemate pristup ovoj vezbi'; END IF;

    -- normalizovani redovi iz JSON-a sa rednim brojem 1..n
    WITH incoming AS (
      SELECT (row_number() OVER ())::int AS set_number,
             nullif(elem->>'reps','')                        AS reps,
             nullif(elem->>'weight_kg','')::numeric          AS weight_kg,
             nullif(elem->>'rest_seconds','')::int           AS rest_seconds,
             nullif(elem->>'notes','')                       AS notes,
             CASE WHEN elem ? 'set_type' THEN nullif(elem->>'set_type','')
                  ELSE (SELECT x.set_type FROM public.program_template_exercise_sets x
                        WHERE x.template_exercise_id = p_exercise_id AND x.set_number = t.ord)
             END                                             AS set_type
      FROM jsonb_array_elements(p_sets) WITH ORDINALITY AS t(elem, ord)
    ),
    upserted AS (
      INSERT INTO public.program_template_exercise_sets
        (template_exercise_id, set_number, reps, weight_kg, rest_seconds, notes, set_type)
      SELECT p_exercise_id, set_number, reps, weight_kg, rest_seconds, notes, set_type FROM incoming
      ON CONFLICT (template_exercise_id, set_number)
      DO UPDATE SET reps = EXCLUDED.reps, weight_kg = EXCLUDED.weight_kg,
                    rest_seconds = EXCLUDED.rest_seconds, notes = EXCLUDED.notes,
                    set_type = EXCLUDED.set_type
      RETURNING 1
    )
    DELETE FROM public.program_template_exercise_sets
    WHERE template_exercise_id = p_exercise_id AND set_number > v_n;

    SELECT reps, weight_kg INTO v_first_reps, v_first_weight
    FROM public.program_template_exercise_sets
    WHERE template_exercise_id = p_exercise_id AND set_number = 1;

    UPDATE public.program_template_exercises
    SET sets = v_n, reps = v_first_reps, weight_kg = v_first_weight
    WHERE id = p_exercise_id;

  ELSE
    SELECT true INTO v_owner_ok
    FROM public.assigned_program_exercises ape
    JOIN public.assigned_program_days d ON d.id = ape.day_id
    JOIN public.assigned_programs p ON p.id = d.assigned_program_id
    WHERE ape.id = p_exercise_id AND p.trainer_id = v_uid;
    IF NOT coalesce(v_owner_ok,false) THEN RAISE EXCEPTION 'Nemate pristup ovoj vezbi'; END IF;

    WITH incoming AS (
      SELECT (row_number() OVER ())::int AS set_number,
             nullif(elem->>'reps','')                        AS reps,
             nullif(elem->>'weight_kg','')::numeric          AS weight_kg,
             nullif(elem->>'rest_seconds','')::int           AS rest_seconds,
             nullif(elem->>'notes','')                       AS notes,
             CASE WHEN elem ? 'set_type' THEN nullif(elem->>'set_type','')
                  ELSE (SELECT x.set_type FROM public.assigned_program_exercise_sets x
                        WHERE x.assigned_exercise_id = p_exercise_id AND x.set_number = t.ord)
             END                                             AS set_type
      FROM jsonb_array_elements(p_sets) WITH ORDINALITY AS t(elem, ord)
    ),
    upserted AS (
      INSERT INTO public.assigned_program_exercise_sets
        (assigned_exercise_id, set_number, reps, weight_kg, rest_seconds, notes, set_type)
      SELECT p_exercise_id, set_number, reps, weight_kg, rest_seconds, notes, set_type FROM incoming
      ON CONFLICT (assigned_exercise_id, set_number)
      DO UPDATE SET reps = EXCLUDED.reps, weight_kg = EXCLUDED.weight_kg,
                    rest_seconds = EXCLUDED.rest_seconds, notes = EXCLUDED.notes,
                    set_type = EXCLUDED.set_type
      RETURNING 1
    )
    DELETE FROM public.assigned_program_exercise_sets
    WHERE assigned_exercise_id = p_exercise_id AND set_number > v_n;

    SELECT reps, weight_kg INTO v_first_reps, v_first_weight
    FROM public.assigned_program_exercise_sets
    WHERE assigned_exercise_id = p_exercise_id AND set_number = 1;

    UPDATE public.assigned_program_exercises
    SET sets = v_n, reps = v_first_reps, weight_kg = v_first_weight
    WHERE id = p_exercise_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'sets', v_n);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Dodela programa vezbacu prenosi i tip serije.
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
  PERFORM public.require_active_trainer_sub();
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

    -- superset_group MORA da stoji ovde: INSERT nize ga cita sa v_ex.
    FOR v_ex IN SELECT id, exercise_id, position, sets, reps, weight_kg, rest_seconds, duration_minutes, superset_group
      FROM public.program_template_exercises WHERE day_id = v_day.id ORDER BY position
    LOOP
      INSERT INTO public.assigned_program_exercises
        (day_id, exercise_id, position, sets, reps, weight_kg, rest_seconds, duration_minutes, superset_group)
      VALUES
        (v_new_day_id, v_ex.exercise_id, v_ex.position, v_ex.sets, v_ex.reps, v_ex.weight_kg, v_ex.rest_seconds, v_ex.duration_minutes, v_ex.superset_group)
      RETURNING id INTO v_new_ex_id;

      INSERT INTO public.assigned_program_exercise_sets
        (assigned_exercise_id, set_number, reps, weight_kg, rest_seconds, notes, set_type)
      SELECT v_new_ex_id, s.set_number, s.reps, s.weight_kg, s.rest_seconds, s.notes, s.set_type
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

-- ---------------------------------------------------------------------------
-- Racvanje plana za danasnji trening prenosi i tip serije.
CREATE OR REPLACE FUNCTION public._fork_session_plan(p_session_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_day uuid; v_broj int;
BEGIN
  SELECT count(*) INTO v_broj FROM public.assigned_program_exercises
  WHERE session_log_id = p_session_id;
  IF v_broj > 0 THEN RETURN 0; END IF;

  SELECT day_id INTO v_day FROM public.workout_session_logs WHERE id = p_session_id;
  IF v_day IS NULL THEN RETURN 0; END IF;

  WITH src AS (
    SELECT ape.*, gen_random_uuid() AS novi_id
    FROM public.assigned_program_exercises ape
    WHERE ape.day_id = v_day
  ),
  ubaci_vezbe AS (
    INSERT INTO public.assigned_program_exercises
      (id, day_id, session_log_id, forked_from, exercise_id, position, sets, reps,
       weight_kg, rest_seconds, notes, deleted_at, duration_minutes, superset_group)
    SELECT s.novi_id, NULL, p_session_id, s.id, s.exercise_id, s.position, s.sets, s.reps,
           s.weight_kg, s.rest_seconds, s.notes, s.deleted_at, s.duration_minutes, s.superset_group
    FROM src s
    RETURNING 1
  ),
  ubaci_serije AS (
    INSERT INTO public.assigned_program_exercise_sets
      (assigned_exercise_id, set_number, reps, weight_kg, rest_seconds, notes, set_type)
    SELECT s.novi_id, aps.set_number, aps.reps, aps.weight_kg, aps.rest_seconds, aps.notes, aps.set_type
    FROM src s
    JOIN public.assigned_program_exercise_sets aps ON aps.assigned_exercise_id = s.id
    RETURNING 1
  )
  UPDATE public.set_logs sl
  SET exercise_id = s.novi_id
  FROM src s
  WHERE sl.session_log_id = p_session_id AND sl.exercise_id = s.id;

  SELECT count(*) INTO v_broj FROM public.assigned_program_exercises
  WHERE session_log_id = p_session_id;
  RETURN v_broj;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Plan treninga za vezbaca i trenera: per-set ciljevi nose i 'set_type'.
CREATE OR REPLACE FUNCTION public.get_session_plan_full(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_athlete uuid; v_day uuid; v_racvan boolean := false;
  v_glava jsonb; v_exercises jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT s.athlete_id, s.day_id INTO v_athlete, v_day
  FROM public.workout_session_logs s WHERE s.id = p_session_id;
  IF v_athlete IS NULL THEN RETURN NULL; END IF;

  IF v_uid <> v_athlete AND NOT public.is_my_athlete(v_uid, v_athlete) THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.assigned_program_exercises
                 WHERE session_log_id = p_session_id) INTO v_racvan;

  SELECT jsonb_build_object(
    'session_id', p_session_id,
    'day_id', v_day,
    'day_number', d.day_number,
    'day_name', COALESCE(d.name, 'Slobodan trening'),
    'assigned_program_id', d.assigned_program_id,
    'is_free', v_day IS NULL,
    'plan_complete', (public.watch_compute_position(p_session_id)->>'complete')::boolean
  ) INTO v_glava
  FROM (SELECT 1) x
  LEFT JOIN public.assigned_program_days d ON d.id = v_day;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ape.id,
      'position', ape.position,
      'superset_group', ape.superset_group,
      'sets', ape.sets,
      'reps', CASE WHEN ape.reps ~ '^[0-9]+$' THEN ape.reps::integer ELSE NULL END,
      'weight_kg', ape.weight_kg,
      'rest_seconds', ape.rest_seconds,
      'duration_minutes', ape.duration_minutes,
      'notes', ape.notes,
      'set_details', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'set_number', aps.set_number,
          'reps', aps.reps,
          'weight_kg', aps.weight_kg,
          'rest_seconds', aps.rest_seconds,
          'set_type', aps.set_type
        ) ORDER BY aps.set_number)
        FROM public.assigned_program_exercise_sets aps
        WHERE aps.assigned_exercise_id = ape.id
      ), '[]'::jsonb),
      'exercise_id', e.id,
      'exercise', jsonb_build_object(
        'name', e.name,
        'name_en', e.name_en,
        'description', e.description,
        'instructions', e.instructions,
        'primary_muscle', e.primary_muscle,
        'equipment', e.equipment,
        'thumbnail_url', e.thumbnail_url,
        'video_url', e.video_url,
        'is_duration_based', e.is_duration_based
      )
    ) ORDER BY ape.position
  ), '[]'::jsonb)
  INTO v_exercises
  FROM public.assigned_program_exercises ape
  JOIN public.exercises e ON e.id = ape.exercise_id
  WHERE ape.deleted_at IS NULL
    AND (CASE WHEN v_racvan THEN ape.session_log_id = p_session_id
              ELSE v_day IS NOT NULL AND ape.day_id = v_day END);

  RETURN v_glava || jsonb_build_object('exercises', v_exercises);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_workout_day_full(p_day_id uuid, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_day jsonb;
  v_exercises jsonb;
  v_sess uuid := p_session_id;
  v_racvan boolean := false;
begin
  select jsonb_build_object(
    'day_id', d.id,
    'day_number', d.day_number,
    'day_name', d.name,
    'notes', d.notes,
    'assigned_program_id', p.id,
    'program_name', p.name
  ) into v_day
  from public.assigned_program_days d
  join public.assigned_programs p on p.id = d.assigned_program_id
  where d.id = p_day_id
    and d.deleted_at is null
    and (p.athlete_id = auth.uid() or p.trainer_id = auth.uid());

  if v_day is null then
    return null;
  end if;

  -- Stari klijent nije poslao sesiju: nadji vezbacev ziv trening za ovaj dan.
  if v_sess is null then
    select s.id into v_sess
    from public.workout_session_logs s
    where s.day_id = p_day_id
      and s.athlete_id = auth.uid()
      and s.is_active = true
    order by s.started_at desc
    limit 1;
  end if;

  if v_sess is not null then
    select exists (
      select 1 from public.assigned_program_exercises
      where session_log_id = v_sess
    ) into v_racvan;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', ape.id,
      'position', ape.position,
      'superset_group', ape.superset_group,
      'sets', ape.sets,
      'reps', case when ape.reps ~ '^[0-9]+$' then ape.reps::integer else null end,
      'weight_kg', ape.weight_kg,
      'rest_seconds', ape.rest_seconds,
      'duration_minutes', ape.duration_minutes,
      'notes', ape.notes,
      'set_details', coalesce((
        select jsonb_agg(jsonb_build_object(
          'set_number', aps.set_number,
          'reps', aps.reps,
          'weight_kg', aps.weight_kg,
          'rest_seconds', aps.rest_seconds,
          'set_type', aps.set_type
        ) order by aps.set_number)
        from public.assigned_program_exercise_sets aps
        where aps.assigned_exercise_id = ape.id
      ), '[]'::jsonb),
      'exercise_id', e.id,
      'exercise', jsonb_build_object(
        'name', e.name,
        'name_en', e.name_en,
        'description', e.description,
        'instructions', e.instructions,
        'primary_muscle', e.primary_muscle,
        'equipment', e.equipment,
        'thumbnail_url', e.thumbnail_url,
        'video_url', e.video_url,
        'is_duration_based', e.is_duration_based
      )
    ) order by ape.position
  ), '[]'::jsonb)
  into v_exercises
  from public.assigned_program_exercises ape
  join public.exercises e on e.id = ape.exercise_id
  where ape.deleted_at is null
    and (case when v_racvan then ape.session_log_id = v_sess
              else ape.day_id = p_day_id end);

  return v_day || jsonb_build_object('exercises', v_exercises);
end $function$;

-- ---------------------------------------------------------------------------
-- Detalj zavrsenog treninga: planirane serije nose i 'set_type'.
CREATE OR REPLACE FUNCTION public.get_inapp_workout_detail(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_athlete uuid;
  v_day_id uuid;
  v_result jsonb;
  v_exercises jsonb;
  v_cfg_max int;
  v_birth_year int;
  v_max_hr int;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT athlete_id, day_id INTO v_athlete, v_day_id
  FROM public.workout_session_logs WHERE id = p_session_id;
  IF v_athlete IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_caller <> v_athlete AND NOT EXISTS (
    SELECT 1 FROM public.athletes a WHERE a.id = v_athlete AND a.trainer_id = v_caller
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  -- Max puls za zone: rucno podeseno ako postoji, inace 220 minus godine, inace fallback 190
  SELECT max_hr INTO v_cfg_max FROM public.user_hr_config WHERE user_id = v_athlete AND max_hr > 0;
  SELECT birth_year INTO v_birth_year FROM public.athletes WHERE id = v_athlete;
  v_max_hr := COALESCE(
    v_cfg_max,
    CASE WHEN v_birth_year IS NOT NULL AND v_birth_year > 1900
         THEN 220 - (EXTRACT(YEAR FROM now())::int - v_birth_year)
         ELSE 190 END
  );
  IF v_max_hr IS NULL OR v_max_hr < 100 THEN v_max_hr := 190; END IF;

  -- Spisak vezbi sa planom (sazetak + per-set ciljevi) i uradjenim serijama
  SELECT jsonb_agg(ex_row ORDER BY ex_pos) INTO v_exercises
  FROM (
    SELECT ape.position AS ex_pos,
      jsonb_build_object(
        'exercise_name', COALESCE(e.name, 'Vezba'),
        'superset_group', ape.superset_group,
        'planned_sets', ape.sets,
        'planned_reps', ape.reps,
        'planned_weight_kg', ape.weight_kg,
        'planned_duration_minutes', ape.duration_minutes,
        'is_duration_based', COALESCE(e.is_duration_based, false),
        'planned_set_details', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'set_number', aps.set_number,
            'reps', aps.reps,
            'weight_kg', aps.weight_kg,
            'rest_seconds', aps.rest_seconds,
            'set_type', aps.set_type
          ) ORDER BY aps.set_number)
          FROM public.assigned_program_exercise_sets aps
          WHERE aps.assigned_exercise_id = ape.id
        ), '[]'::jsonb),
        'sets', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'set_number', sl.set_number,
            'reps', sl.reps,
            'weight_kg', sl.weight_kg,
            'rpe', sl.rpe,
            'duration_minutes', sl.duration_minutes,
            'done', sl.done
          ) ORDER BY sl.set_number)
          FROM public.set_logs sl
          WHERE sl.session_log_id = p_session_id AND sl.exercise_id = ape.id
        ), '[]'::jsonb),
        'done_count', (
          SELECT count(*) FROM public.set_logs sl
          WHERE sl.session_log_id = p_session_id AND sl.exercise_id = ape.id AND sl.done = true
        )
      ) AS ex_row
    FROM public.assigned_program_exercises ape
    LEFT JOIN public.exercises e ON e.id = ape.exercise_id
    WHERE ape.deleted_at IS NULL
      AND (CASE WHEN EXISTS (SELECT 1 FROM public.assigned_program_exercises z
                              WHERE z.session_log_id = p_session_id)
                 THEN ape.session_log_id = p_session_id
                 ELSE ape.day_id = v_day_id END)
  ) sub;

  SELECT jsonb_build_object(
    'success', true,
    'id', s.id,
    'day_number', s.day_number,
    'started_at', s.started_at,
    'completed_at', s.completed_at,
    'duration_seconds', s.duration_seconds,
    'total_volume_kg', s.total_volume_kg,
    'active_calories', s.active_calories,
    'hr_avg', s.live_hr_avg,
    'hr_max', s.live_hr_max,
    -- Uvek [[sekunde, bpm], ...], bez obzira kojim oblikom je puls upisan.
    'hr_series', hr.ser,
    'max_hr', v_max_hr,
    'zones', public._compute_hr_zones(hr.ser, v_max_hr),
    'notes', s.notes,
    'program_name', ap.name,
    'day_name', ad.name,
    'entry_title', s.entry_title,
    'entered_by_trainer', s.entered_by_trainer,
    'birth_year', ath.birth_year,
    'sets_done', (SELECT count(*) FROM public.set_logs sl WHERE sl.session_log_id = s.id AND sl.done = true),
    'exercises', COALESCE(v_exercises, '[]'::jsonb)
  ) INTO v_result
  FROM public.workout_session_logs s
  CROSS JOIN LATERAL (SELECT public._normalize_hr_series(s.hr_series, s.started_at) AS ser) hr
  LEFT JOIN public.assigned_programs ap ON ap.id = s.assigned_program_id
  LEFT JOIN public.assigned_program_days ad ON ad.id = s.day_id
  LEFT JOIN public.athletes ath ON ath.id = s.athlete_id
  WHERE s.id = p_session_id;

  RETURN v_result;
END $function$;

-- ---------------------------------------------------------------------------
-- Trener uzivo menja tip jedne serije. Kao svaka izmena plana vazi samo za danas.
CREATE OR REPLACE FUNCTION public.trainer_set_set_type(
  p_session_id uuid, p_ape_id uuid, p_set_number integer, p_type text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_athlete uuid; v_ape uuid; v_sets int;
  v_tip text := NULLIF(trim(COALESCE(p_type, '')), '');
BEGIN
  v_athlete := public._trainer_edit_guard(p_session_id);

  IF v_tip IS NOT NULL AND v_tip NOT IN ('warmup','failure','drop','left','right','negative',
                                          'partial','myo','feeder','top','backoff') THEN
    RAISE EXCEPTION 'Nepoznat tip serije';
  END IF;

  PERFORM public._fork_session_plan(p_session_id);
  v_ape := public._session_plan_row(p_session_id, p_ape_id);
  IF v_ape IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u ovom treningu'; END IF;

  SELECT sets INTO v_sets FROM public.assigned_program_exercises WHERE id = v_ape;
  IF p_set_number < 1 OR p_set_number > v_sets THEN
    RAISE EXCEPTION 'Serija % ne postoji u ovoj vezbi (ima ih %)', p_set_number, v_sets;
  END IF;

  -- Serija bez svog reda dobija red sa ciljem vezbe, pa tek onda tip.
  INSERT INTO public.assigned_program_exercise_sets
    (assigned_exercise_id, set_number, reps, weight_kg, rest_seconds, set_type)
  SELECT ape.id, p_set_number, ape.reps, ape.weight_kg, ape.rest_seconds, v_tip
  FROM public.assigned_program_exercises ape
  WHERE ape.id = v_ape
  ON CONFLICT (assigned_exercise_id, set_number) DO UPDATE
    SET set_type = EXCLUDED.set_type;

  -- plan_version je jedini signal vezbacevom telefonu i satu.
  RETURN public._trainer_resync_live(p_session_id, v_athlete)
         || jsonb_build_object('set_number', p_set_number, 'set_type', v_tip);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Trener uzivo brise jednu seriju: i planiranu i upisanu ako je vec uradjena.
-- Serije iza nje se pomeraju za jedno mesto, pa brojevi ostaju 1..n.
CREATE OR REPLACE FUNCTION public.trainer_remove_set(
  p_session_id uuid, p_ape_id uuid, p_set_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_athlete uuid; v_ape uuid; v_sets int; v_upis int;
BEGIN
  v_athlete := public._trainer_edit_guard(p_session_id);

  IF NOT EXISTS (SELECT 1 FROM public.workout_session_logs
                 WHERE id = p_session_id AND is_active = true) THEN
    RAISE EXCEPTION 'Trening je vec zavrsen';
  END IF;

  PERFORM public._fork_session_plan(p_session_id);
  v_ape := public._session_plan_row(p_session_id, p_ape_id);
  IF v_ape IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u ovom treningu'; END IF;

  SELECT sets INTO v_sets FROM public.assigned_program_exercises
  WHERE id = v_ape FOR UPDATE;
  IF v_sets <= 1 THEN RAISE EXCEPTION 'Vezba mora imati bar jednu seriju'; END IF;
  IF p_set_number < 1 OR p_set_number > v_sets THEN
    RAISE EXCEPTION 'Serija % ne postoji u ovoj vezbi (ima ih %)', p_set_number, v_sets;
  END IF;

  DELETE FROM public.set_logs
  WHERE session_log_id = p_session_id AND exercise_id = v_ape AND set_number = p_set_number;
  GET DIAGNOSTICS v_upis = ROW_COUNT;

  DELETE FROM public.assigned_program_exercise_sets
  WHERE assigned_exercise_id = v_ape AND set_number = p_set_number;

  -- Pomeranje u dva koraka: jedinstven kljuc (vezba, broj serije) bi pukao
  -- da se broj 4 prepise u 3 pre nego sto se 3 pomeri u 2.
  UPDATE public.set_logs SET set_number = -(set_number - 1)
  WHERE session_log_id = p_session_id AND exercise_id = v_ape AND set_number > p_set_number;
  UPDATE public.set_logs SET set_number = -set_number
  WHERE session_log_id = p_session_id AND exercise_id = v_ape AND set_number < 0;

  UPDATE public.assigned_program_exercise_sets SET set_number = -(set_number - 1)
  WHERE assigned_exercise_id = v_ape AND set_number > p_set_number;
  UPDATE public.assigned_program_exercise_sets SET set_number = -set_number
  WHERE assigned_exercise_id = v_ape AND set_number < 0;

  UPDATE public.assigned_program_exercises SET sets = v_sets - 1 WHERE id = v_ape;

  -- Sazetak na vezbi prati prvu seriju (isto kao trainer_set_set_target).
  IF p_set_number = 1 THEN
    UPDATE public.assigned_program_exercises ape
    SET reps = COALESCE(s.reps, ape.reps), weight_kg = COALESCE(s.weight_kg, ape.weight_kg)
    FROM public.assigned_program_exercise_sets s
    WHERE ape.id = v_ape AND s.assigned_exercise_id = v_ape AND s.set_number = 1;
  END IF;

  RETURN public._trainer_resync_live(p_session_id, v_athlete)
         || jsonb_build_object('sets', v_sets - 1, 'removed_log', v_upis > 0);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trainer_set_set_type(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_set_set_type(uuid, uuid, integer, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.trainer_remove_set(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_remove_set(uuid, uuid, integer) TO authenticated;
