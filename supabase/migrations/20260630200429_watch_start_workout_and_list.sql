-- 1) Interni helper: ista logika kao stari start_workout_session, ali sa eksplicitnim user_id
create or replace function public._start_workout_session(
  p_athlete_id uuid, p_assigned_program_id uuid, p_day_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_athlete_id uuid := p_athlete_id;
  v_day_number integer;
  v_session_id uuid;
  v_existing uuid;
  v_pos jsonb;
begin
  if v_athlete_id is null then
    raise exception 'Nedostaje korisnik';
  end if;

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
end;
$function$;

-- Interni helper nije za direktan poziv spolja (anon ne sme da pokrene za tudji user_id)
revoke execute on function public._start_workout_session(uuid, uuid, uuid) from public;

-- 2) start_workout_session ostaje isti potpis, sad samo omotac sa auth.uid()
create or replace function public.start_workout_session(
  p_assigned_program_id uuid, p_day_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return public._start_workout_session(auth.uid(), p_assigned_program_id, p_day_id);
end;
$function$;

grant execute on function public.start_workout_session(uuid, uuid) to authenticated, service_role;

-- 3) Lista treninga za sat: dani aktivnog (objavljenog) programa
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
    'server_now_ms', (extract(epoch from now())*1000)::bigint,
    'program', jsonb_build_object(
      'id', v_prog_id,
      'name', v_prog_name,
      'current_day', v_current_day
    ),
    'days', v_days
  );
end;
$function$;

grant execute on function public.watch_list_workouts(text) to anon, authenticated, service_role;

-- 4) Pokretanje treninga sa sata (token-bazirano)
create or replace function public.watch_start_workout(
  p_token text, p_assigned_program_id uuid, p_day_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid;
  v_session_id uuid;
begin
  select user_id into v_user_id from public.watch_pairing_tokens
   where token = p_token and revoked_at is null and expires_at > now();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'invalid_token');
  end if;

  begin
    v_session_id := public._start_workout_session(v_user_id, p_assigned_program_id, p_day_id);
  exception when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
  end;

  return jsonb_build_object('success', true, 'session_id', v_session_id);
end;
$function$;

grant execute on function public.watch_start_workout(text, uuid, uuid) to anon, authenticated, service_role;
