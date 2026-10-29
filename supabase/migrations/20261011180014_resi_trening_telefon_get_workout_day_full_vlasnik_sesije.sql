-- get_workout_day_full proverava ciju sesiju dobija u p_session_id. Potpis i odgovor su isti.

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

  -- Poslata sesija vazi samo ako je bas za ovaj dan i ako pripada onome ko zove ili
  -- njegovom vezbacu. Ranije se uzimala kako je stigla, pa je tudji izmenjen plan
  -- (vezbe, ciljevi, trenerove beleske) mogao da se procita uz sopstveni dan.
  if v_sess is not null and not exists (
    select 1 from public.workout_session_logs s
    where s.id = v_sess
      and s.day_id = p_day_id
      and (s.athlete_id = auth.uid()
           or exists (select 1 from public.athletes a
                      where a.id = s.athlete_id and a.trainer_id = auth.uid()))
  ) then
    v_sess := null;
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
