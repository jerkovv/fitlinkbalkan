-- Jedan mozak, strogo: vezbac ima najvise jedan trening u toku i svaki njegov uredjaj je u
-- njemu. Pokretanje drugog treninga (drugi dan plana ili slobodan) dok jedan traje vise ne
-- zatvara postojeci, nego se odbija; isti dan i isti slobodan trening vracaju postojecu
-- sesiju, pa se uredjaj prikljuci. Sat nastavlja trening u toku bez roka od 3 sata.

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

  -- Dva uredjaja koja pokrecu u istom trenutku cekaju jedan drugog, pa drugi vec vidi
  -- trening koji je prvi pokrenuo.
  perform pg_advisory_xact_lock(hashtextextended('trening:' || v_athlete_id::text, 0));

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
    and completed_at is null
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

  -- Jedan mozak: dok jedan trening traje, drugi ne moze da krene ni sa jednog uredjaja.
  -- Ranije je ovde postojeci trening tiho zatvaran, pa je telefon ostajao u treningu koji
  -- je sat upravo ugasio pokretanjem drugog (i obrnuto).
  if exists (select 1 from public.workout_session_logs
              where athlete_id = v_athlete_id and is_active = true and completed_at is null) then
    raise exception 'Trening već traje. Završi ga pre nego što pokreneš novi.';
  end if;

  -- Ostaci koji nisu trening u toku: sesija oznacena aktivnom iako je zatvorena, i zivi
  -- redovi sesija koje vise ne traju.
  update public.workout_session_logs
     set is_active = false
   where athlete_id = v_athlete_id and is_active = true and completed_at is not null;

  update public.workout_live_state w
     set current_state = 'completed'
   where w.athlete_id = v_athlete_id and w.current_state in ('active','rest')
     and not exists (select 1 from public.workout_session_logs s
                      where s.id = w.session_log_id and s.is_active = true);

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

CREATE OR REPLACE FUNCTION public._start_free_workout_session(p_athlete_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_session_id uuid;
begin
  if p_athlete_id is null then
    raise exception 'Nedostaje korisnik';
  end if;

  -- Dva uredjaja koja pokrecu u istom trenutku cekaju jedan drugog.
  perform pg_advisory_xact_lock(hashtextextended('trening:' || p_athlete_id::text, 0));

  -- Slobodan trening koji vec traje: vraca se isti, drugi uredjaj mu se prikljucuje.
  select id into v_session_id
  from public.workout_session_logs
  where athlete_id = p_athlete_id and is_active = true and completed_at is null and day_id is null
  order by started_at desc
  limit 1;

  if v_session_id is not null then
    insert into public.workout_live_state (
      session_log_id, athlete_id, current_state,
      current_exercise_idx, current_exercise_name,
      current_set_number, total_sets, last_heartbeat
    ) values (
      v_session_id, p_athlete_id, 'active',
      null, null, null, 0, now()
    )
    on conflict (session_log_id) do update
      set current_state = case when public.workout_live_state.current_state in ('active','rest')
                               then public.workout_live_state.current_state else 'active' end,
          last_heartbeat = now();
    return v_session_id;
  end if;

  -- Jedan mozak: dok traje trening po planu, slobodan ne moze da krene ni sa jednog uredjaja.
  -- Ranije je ovde postojeci trening tiho zatvaran.
  if exists (select 1 from public.workout_session_logs
              where athlete_id = p_athlete_id and is_active = true and completed_at is null) then
    raise exception 'Trening već traje. Završi ga pre nego što pokreneš novi.';
  end if;

  -- Ostaci koji nisu trening u toku.
  update public.workout_session_logs
     set is_active = false
   where athlete_id = p_athlete_id and is_active = true and completed_at is not null;

  update public.workout_live_state w
     set current_state = 'completed'
   where w.athlete_id = p_athlete_id and w.current_state in ('active','rest')
     and not exists (select 1 from public.workout_session_logs s
                      where s.id = w.session_log_id and s.is_active = true);

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
$function$;

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

  -- Isti izvor kao telefon: aktivna sesija u workout_session_logs, bez roka. Dok god je
  -- telefon vidi kao trening u toku, vidi je i sat; drugi trening ionako ne moze da krene.
  SELECT s.id INTO v_sid
  FROM public.workout_session_logs s
  JOIN public.workout_live_state w ON w.session_log_id = s.id
  WHERE s.athlete_id = v_user_id
    AND s.is_active = true
    AND s.completed_at IS NULL
    AND w.current_state IN ('active','rest')
  ORDER BY s.started_at DESC
  LIMIT 1;

  IF v_sid IS NULL THEN
    RETURN jsonb_build_object('success', true, 'session_id', NULL);
  END IF;

  UPDATE public.workout_live_state SET last_heartbeat = now() WHERE session_log_id = v_sid;
  RETURN jsonb_build_object('success', true, 'session_id', v_sid);
END;
$function$;
