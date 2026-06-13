-- Soft-delete za dodeljeni plan: trener moze da sakrije vezbu/dan iz tekuceg
-- plana bez gubitka istorije (set_logs/workout_session_logs imaju CASCADE).
-- Vec primenjeno u bazi (kreirano preko MCP); ova migracija unosi sve u
-- version-control. Bezbedno re-runnable.

ALTER TABLE public.assigned_program_exercises ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.assigned_program_days ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_ape_active ON public.assigned_program_exercises (day_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_apd_active ON public.assigned_program_days (assigned_program_id) WHERE deleted_at IS NULL;

-- Filtrirani RPC-ovi (tekuci plan ignorise soft-deleted vezbe/dane).

CREATE OR REPLACE FUNCTION public.get_next_workout_day(p_athlete_id uuid)
 RETURNS TABLE(assigned_program_id uuid, program_name text, day_id uuid, day_number integer, day_name text, total_days integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_program_id uuid;
  v_total_days int;
  v_last_day int;
  v_next_day int;
BEGIN
  SELECT ap.id INTO v_program_id
  FROM public.assigned_programs ap
  WHERE ap.athlete_id = p_athlete_id
  ORDER BY ap.assigned_at DESC
  LIMIT 1;

  IF v_program_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO v_total_days
  FROM public.assigned_program_days apd
  WHERE apd.assigned_program_id = v_program_id
    AND apd.deleted_at IS NULL;

  IF v_total_days = 0 THEN
    RETURN;
  END IF;

  SELECT wsl.day_number INTO v_last_day
  FROM public.workout_session_logs wsl
  WHERE wsl.athlete_id = p_athlete_id
    AND wsl.assigned_program_id = v_program_id
    AND wsl.completed_at IS NOT NULL
  ORDER BY wsl.completed_at DESC
  LIMIT 1;

  v_next_day := COALESCE((v_last_day % v_total_days) + 1, 1);

  RETURN QUERY
  SELECT
    ap.id,
    ap.name,
    apd.id,
    apd.day_number,
    apd.name,
    v_total_days
  FROM public.assigned_programs ap
  JOIN public.assigned_program_days apd ON apd.assigned_program_id = ap.id
  WHERE ap.id = v_program_id
    AND apd.deleted_at IS NULL
    AND apd.day_number = v_next_day;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_workout_day_full(p_day_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_day jsonb;
  v_exercises jsonb;
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

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', ape.id,
      'position', ape.position,
      'sets', ape.sets,
      'reps', case when ape.reps ~ '^[0-9]+$' then ape.reps::integer else null end,
      'weight_kg', ape.weight_kg,
      'rest_seconds', ape.rest_seconds,
      'notes', ape.notes,
      'exercise_id', e.id,
      'exercise', jsonb_build_object(
        'name', e.name,
        'name_en', e.name_en,
        'description', e.description,
        'instructions', e.instructions,
        'primary_muscle', e.primary_muscle,
        'equipment', e.equipment,
        'thumbnail_url', e.thumbnail_url,
        'video_url', e.video_url
      )
    ) order by ape.position
  ), '[]'::jsonb)
  into v_exercises
  from public.assigned_program_exercises ape
  join public.exercises e on e.id = ape.exercise_id
  where ape.day_id = p_day_id
    and ape.deleted_at is null;

  return v_day || jsonb_build_object('exercises', v_exercises);
end $function$;

CREATE OR REPLACE FUNCTION public.start_workout_session(p_assigned_program_id uuid, p_day_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_athlete_id uuid := auth.uid();
  v_day_number integer;
  v_session_id uuid;
  v_existing uuid;
  v_pos jsonb;
begin
  select day_number into v_day_number
  from public.assigned_program_days d
  join public.assigned_programs p on p.id = d.assigned_program_id
  where d.id = p_day_id
    and d.deleted_at is null
    and p.athlete_id = v_athlete_id
    and p.id = p_assigned_program_id;

  if v_day_number is null then
    raise exception 'Program day not found or not yours';
  end if;

  select id into v_existing
  from public.workout_session_logs
  where athlete_id = v_athlete_id
    and day_id = p_day_id
    and is_active = true
  order by started_at desc
  limit 1;

  if v_existing is not null then
    if not exists (
      select 1 from public.workout_live_state
      where session_log_id = v_existing
        and current_state in ('active','rest')
    ) then
      v_pos := public.watch_compute_position(v_existing);
      if not coalesce((v_pos->>'complete')::boolean, true) then
        insert into public.workout_live_state (
          session_log_id, athlete_id, current_state,
          current_exercise_idx, current_exercise_name,
          current_set_number, total_sets, last_heartbeat
        ) values (
          v_existing, v_athlete_id, 'active',
          (v_pos->>'exercise_idx')::int, v_pos->>'exercise_name',
          (v_pos->>'set_number')::int, (v_pos->>'total_sets')::int, now()
        )
        on conflict (session_log_id) do update
          set current_state='active',
              current_exercise_idx=excluded.current_exercise_idx,
              current_exercise_name=excluded.current_exercise_name,
              current_set_number=excluded.current_set_number,
              total_sets=excluded.total_sets,
              last_heartbeat=now();
      end if;
    end if;
    return v_existing;
  end if;

  update public.workout_session_logs
  set is_active = false, completed_at = coalesce(completed_at, now())
  where athlete_id = v_athlete_id and is_active = true;

  update public.workout_live_state
  set current_state = 'completed'
  where athlete_id = v_athlete_id and current_state in ('active','rest');

  insert into public.workout_session_logs (
    athlete_id, assigned_program_id, day_id, day_number, started_at, is_active
  ) values (
    v_athlete_id, p_assigned_program_id, p_day_id, v_day_number, now(), true
  )
  returning id into v_session_id;

  v_pos := public.watch_compute_position(v_session_id);
  if not coalesce((v_pos->>'complete')::boolean, true) then
    insert into public.workout_live_state (
      session_log_id, athlete_id, current_state,
      current_exercise_idx, current_exercise_name,
      current_set_number, total_sets, last_heartbeat
    ) values (
      v_session_id, v_athlete_id, 'active',
      (v_pos->>'exercise_idx')::int, v_pos->>'exercise_name',
      (v_pos->>'set_number')::int, (v_pos->>'total_sets')::int, now()
    )
    on conflict (session_log_id) do update
      set current_state='active',
          current_exercise_idx=excluded.current_exercise_idx,
          current_exercise_name=excluded.current_exercise_name,
          current_set_number=excluded.current_set_number,
          total_sets=excluded.total_sets,
          last_heartbeat=now();
  end if;

  return v_session_id;
end $function$;

CREATE OR REPLACE FUNCTION public.watch_compute_position(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_day_id uuid;
  v_row record;
BEGIN
  SELECT day_id INTO v_day_id FROM public.workout_session_logs WHERE id = p_session_id;
  IF v_day_id IS NULL THEN
    RETURN jsonb_build_object('complete', true, 'error', 'no_session');
  END IF;

  WITH plan AS (
    SELECT ape.id AS ape_id,
           ape.position,
           (row_number() OVER (ORDER BY ape.position) - 1)::int AS exercise_idx,
           ape.sets,
           COALESCE(ape.rest_seconds, 60) AS rest_seconds,
           CASE WHEN ape.reps ~ '^[0-9]+$' THEN ape.reps::int ELSE NULL END AS planned_reps,
           ape.weight_kg AS planned_weight,
           COALESCE(e.name_en, e.name) AS exercise_name
    FROM public.assigned_program_exercises ape
    JOIN public.exercises e ON e.id = ape.exercise_id
    WHERE ape.day_id = v_day_id
      AND ape.deleted_at IS NULL
  ),
  done AS (
    SELECT exercise_id AS ape_id, count(*) AS done_count
    FROM public.set_logs
    WHERE session_log_id = p_session_id AND done = true
    GROUP BY exercise_id
  ),
  merged AS (
    SELECT p.*, COALESCE(d.done_count, 0) AS done_count
    FROM plan p LEFT JOIN done d ON d.ape_id = p.ape_id
  )
  SELECT * INTO v_row
  FROM merged
  WHERE done_count < sets
  ORDER BY position
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('complete', true);
  END IF;

  RETURN jsonb_build_object(
    'complete', false,
    'ape_id', v_row.ape_id,
    'exercise_idx', v_row.exercise_idx,
    'set_number', (v_row.done_count + 1)::int,
    'total_sets', v_row.sets,
    'rest_seconds', v_row.rest_seconds,
    'exercise_name', v_row.exercise_name,
    'planned_reps', v_row.planned_reps,
    'planned_weight', v_row.planned_weight
  );
END $function$;
