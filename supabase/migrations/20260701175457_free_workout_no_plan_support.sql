-- Slobodan trening (bez plana): dozvoli sesiju bez day_id/programa
alter table public.workout_session_logs alter column day_id drop not null;
alter table public.workout_session_logs alter column assigned_program_id drop not null;
alter table public.workout_session_logs alter column day_number drop not null;

-- Interni starter za slobodan trening (bez plana), single-active pravilo
create or replace function public._start_free_workout_session(p_athlete_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_session_id uuid;
begin
  if p_athlete_id is null then
    raise exception 'Nedostaje korisnik';
  end if;

  update public.workout_session_logs
  set is_active = false, completed_at = coalesce(completed_at, now())
  where athlete_id = p_athlete_id and is_active = true;

  update public.workout_live_state
  set current_state = 'completed'
  where athlete_id = p_athlete_id and current_state in ('active','rest');

  insert into public.workout_session_logs (
    athlete_id, assigned_program_id, day_id, day_number, started_at, is_active
  ) values (
    p_athlete_id, null, null, null, now(), true
  )
  returning id into v_session_id;

  insert into public.workout_live_state (
    session_log_id, athlete_id, current_state,
    current_exercise_idx, current_exercise_name,
    current_set_number, total_sets, last_heartbeat
  ) values (
    v_session_id, p_athlete_id, 'active',
    null, null, null, 0, now()
  )
  on conflict (session_log_id) do update
    set current_state = 'active', total_sets = 0, last_heartbeat = now();

  return v_session_id;
end;
$$;

-- Telefon (autentifikovan)
create or replace function public.start_free_workout()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_uid uuid := auth.uid(); v_sid uuid;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;
  begin
    v_sid := public._start_free_workout_session(v_uid);
  exception when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
  end;
  return jsonb_build_object('success', true, 'session_id', v_sid);
end;
$$;

-- Sat (token)
create or replace function public.watch_start_free_workout(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_user_id uuid; v_sid uuid;
begin
  select user_id into v_user_id from public.watch_pairing_tokens
   where token = p_token and revoked_at is null and expires_at > now();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'invalid_token');
  end if;
  begin
    v_sid := public._start_free_workout_session(v_user_id);
  exception when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
  end;
  return jsonb_build_object('success', true, 'session_id', v_sid);
end;
$$;

revoke all on function public._start_free_workout_session(uuid) from public, anon, authenticated;
grant execute on function public.start_free_workout() to authenticated;
grant execute on function public.watch_start_free_workout(text) to anon, authenticated, service_role;
