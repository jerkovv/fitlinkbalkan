-- watch_list_workouts sad vraca next_day_number (ista logika kao get_next_workout_day):
-- sledeci dan = (poslednji zavrsen dan % ukupno) + 1, ili 1 ako nista nije zavrseno.
create or replace function public.watch_list_workouts(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid;
  v_prog_id uuid;
  v_prog_name text;
  v_current_day integer;
  v_total_days integer;
  v_last_day integer;
  v_next_day integer;
  v_days jsonb;
begin
  select user_id into v_user_id from public.watch_pairing_tokens
   where token = p_token and revoked_at is null and expires_at > now();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'invalid_token');
  end if;

  select ap.id, ap.name, ap.current_day
    into v_prog_id, v_prog_name, v_current_day
  from public.assigned_programs ap
  where ap.athlete_id = v_user_id
    and ap.is_active = true
    and ap.published_at is not null
  order by ap.published_at desc nulls last
  limit 1;

  if v_prog_id is null then
    return jsonb_build_object('success', true, 'program', null, 'days', '[]'::jsonb);
  end if;

  select count(*)::int into v_total_days
  from public.assigned_program_days apd
  where apd.assigned_program_id = v_prog_id and apd.deleted_at is null;

  select wsl.day_number into v_last_day
  from public.workout_session_logs wsl
  where wsl.athlete_id = v_user_id
    and wsl.assigned_program_id = v_prog_id
    and wsl.completed_at is not null
  order by wsl.completed_at desc
  limit 1;

  v_next_day := coalesce((v_last_day % nullif(v_total_days, 0)) + 1, 1);

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'day_id', d.id,
             'day_number', d.day_number,
             'name', d.name,
             'exercise_count', (
               select count(*) from public.assigned_program_exercises ape
               where ape.day_id = d.id and ape.deleted_at is null
             )
           ) order by d.day_number
         ), '[]'::jsonb)
    into v_days
  from public.assigned_program_days d
  where d.assigned_program_id = v_prog_id
    and d.deleted_at is null;

  return jsonb_build_object(
    'success', true,
    'server_now_ms', (extract(epoch from now()) * 1000)::bigint,
    'program', jsonb_build_object(
      'id', v_prog_id,
      'name', v_prog_name,
      'current_day', v_current_day,
      'next_day_number', v_next_day
    ),
    'days', v_days
  );
end;
$function$;

grant execute on function public.watch_list_workouts(text) to anon, authenticated, service_role;
