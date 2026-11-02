-- Sat i telefon kao jedan mozak: trening koji traje vidi svaki uredjaj vezbaca.
--
-- Citanje stanja (watch_poll_state, watch_get_user_context) krije trening ciji je otkucaj
-- stariji od 5 minuta. Telefon uspavan u dzepu ne salje otkucaje, pa sat otvoren posle toga
-- nije video trening koji i dalje traje, a pokretanje istog dana sa sata je vracalo tu istu,
-- skrivenu sesiju. Telefon se iz toga vadi sam (pita workout_session_logs.is_active i posalje
-- otkucaj); ovo je isti put za sat.
CREATE OR REPLACE FUNCTION public.watch_resume_session(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid; v_sid uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM public.watch_pairing_tokens
   WHERE token = p_token AND revoked_at IS NULL AND expires_at > now();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'invalid_token'); END IF;

  -- Isti izvor kao telefon: aktivna sesija u workout_session_logs. Granica od 3 sata tisine
  -- cuva sat od treninga koji je ostao ukljucen od juce.
  SELECT s.id INTO v_sid
  FROM public.workout_session_logs s
  JOIN public.workout_live_state w ON w.session_log_id = s.id
  WHERE s.athlete_id = v_user_id
    AND s.is_active = true
    AND s.completed_at IS NULL
    AND w.current_state IN ('active','rest')
    AND GREATEST(w.last_heartbeat, s.started_at) > now() - interval '3 hours'
  ORDER BY s.started_at DESC
  LIMIT 1;

  IF v_sid IS NULL THEN
    RETURN jsonb_build_object('success', true, 'session_id', NULL);
  END IF;

  UPDATE public.workout_live_state SET last_heartbeat = now() WHERE session_log_id = v_sid;
  RETURN jsonb_build_object('success', true, 'session_id', v_sid);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.watch_resume_session(text) TO anon, authenticated, service_role;

-- Pokretanje dana koji vec ima aktivnu sesiju vraca tu sesiju; sada joj i osvezi otkucaj.
-- Ostatak tela je nepromenjen.
CREATE OR REPLACE FUNCTION public._start_workout_session(p_athlete_id uuid, p_assigned_program_id uuid, p_day_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Trening koji traje, a telefon je bio uspavan: otkucaj je star, pa ga citanje stanja
    -- (athlete_poll_state, watch_poll_state) krije. Uredjaj koji ga upravo pokrece dobija
    -- ovu istu sesiju i mora odmah da je vidi.
    update public.workout_live_state
       set last_heartbeat = now()
     where session_log_id = v_existing
       and current_state in ('active','rest');
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
