-- Plan koji ekrani citaju: ako trening ima svoj spisak vezbi (trener je nesto
-- promenio danas), vraca se ON; inace sablon dana, kao i do sada.
--
-- Stara jednoargumentna verzija se DROP-uje: sa novom koja ima podrazumevanu
-- vrednost bi poziv sa jednim imenovanim argumentom bio dvosmislen.
DROP FUNCTION IF EXISTS public.get_workout_day_full(uuid);

CREATE FUNCTION public.get_workout_day_full(p_day_id uuid, p_session_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_day jsonb;
  v_exercises jsonb;
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

  if p_session_id is not null then
    select exists (
      select 1 from public.assigned_program_exercises
      where session_log_id = p_session_id
    ) into v_racvan;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', ape.id,
      'position', ape.position,
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
          'rest_seconds', aps.rest_seconds
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
    and (case when v_racvan then ape.session_log_id = p_session_id
              else ape.day_id = p_day_id end);

  return v_day || jsonb_build_object('exercises', v_exercises);
end $function$;

REVOKE ALL ON FUNCTION public.get_workout_day_full(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_workout_day_full(uuid, uuid) TO authenticated;
