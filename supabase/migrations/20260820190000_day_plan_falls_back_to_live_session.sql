-- Vezbaci koji jos imaju STARO izdanje aplikacije moraju da vide izmene.
--
-- Ugradjena aplikacija nosi svoj paket (capacitor.config.ts nema server.url),
-- pa objava na web ne stize do telefona instaliranog iz prodavnice. Takav
-- klijent zove get_workout_day_full BEZ p_session_id i zato dobija sablon dana:
-- trener usred treninga doda seriju, a vezbacu i dalje pise "2/3" umesto "2/5".
--
-- Zato: kad sesija nije prosledjena, potrazi ZIVU sesiju BAS TOG vezbaca za taj
-- dan. Uslov je auth.uid() = athlete_id, pa trener koji u builderu gleda sablon
-- i dalje vidi sablon - njemu se nista ne podmece.
--
-- Uzgred resava i tezi problem: posle racvanja set_logs pokazuju na redove
-- sesije, pa bi stari klijent sa sablonskim id-jevima pogresno racunao koje su
-- serije odradjene.
CREATE OR REPLACE FUNCTION public.get_workout_day_full(p_day_id uuid, p_session_id uuid DEFAULT NULL)
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
    and (case when v_racvan then ape.session_log_id = v_sess
              else ape.day_id = p_day_id end);

  return v_day || jsonb_build_object('exercises', v_exercises);
end $function$;

REVOKE ALL ON FUNCTION public.get_workout_day_full(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_workout_day_full(uuid, uuid) TO authenticated;
