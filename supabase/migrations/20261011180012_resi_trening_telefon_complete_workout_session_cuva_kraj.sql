-- complete_workout_session vise ne prepisuje kraj i trajanje vec zavrsenog treninga.
-- Potpis i kljucevi odgovora su isti, pa React (ActiveWorkout, AthleteFreeWorkout) radi kao do sada.

CREATE OR REPLACE FUNCTION public.complete_workout_session(p_session_id uuid, p_hr_avg integer DEFAULT NULL::integer, p_hr_max integer DEFAULT NULL::integer, p_hr_min integer DEFAULT NULL::integer, p_active_calories numeric DEFAULT NULL::numeric, p_hr_series jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_session public.workout_session_logs;
  v_total_volume numeric;
  v_set_count integer;
  v_duration integer;
  v_serija jsonb;
  v_avg int;
  v_max int;
  v_vec_gotov boolean;
begin
  select * into v_session
  from public.workout_session_logs
  where id = p_session_id and athlete_id = auth.uid();

  if v_session.id is null then
    raise exception 'Session not found or not yours';
  end if;

  select
    coalesce(sum(reps * weight_kg), 0),
    count(*)
  into v_total_volume, v_set_count
  from public.set_logs
  where session_log_id = p_session_id and done = true;

  -- Trening koji je vec zatvoren (poslednja serija, sat, trener) zadrzava svoj kraj i
  -- trajanje: ovaj poziv tada samo dodaje puls i kalorije. Ranije je zakasneli poziv
  -- sa telefona pomerao kraj na "sada" i naduvavao trajanje.
  v_vec_gotov := v_session.completed_at is not null;
  v_duration := case when v_vec_gotov
    then coalesce(v_session.duration_seconds,
                  extract(epoch from (v_session.completed_at - v_session.started_at))::integer)
    else extract(epoch from (now() - v_session.started_at))::integer end;

  -- Spoj onoga sto je server zabelezio i onoga sto telefon donese na kraju: ranije se
  -- birao duzi niz, pa je drugi propadao (trening od 2h sa 16 minuta pulsa).
  v_serija := public._merge_hr_series(v_session.hr_series, p_hr_series, v_session.started_at);
  select round(avg((e->>1)::numeric))::int, max((e->>1)::int)
    into v_avg, v_max
    from jsonb_array_elements(v_serija) e;

  update public.workout_session_logs
  set
    completed_at = case when v_vec_gotov then completed_at else now() end,
    duration_seconds = v_duration,
    is_active = false,
    live_hr_avg = COALESCE(v_avg, NULLIF(p_hr_avg, 0), live_hr_avg),
    live_hr_max = GREATEST(COALESCE(live_hr_max, 0), COALESCE(NULLIF(p_hr_max, 0), 0), COALESCE(v_max, 0)),
    live_hr_min = COALESCE(NULLIF(p_hr_min, 0), live_hr_min),
    active_calories = COALESCE(NULLIF(p_active_calories, 0), active_calories),
    hr_series = CASE WHEN jsonb_array_length(v_serija) > 0 THEN v_serija ELSE hr_series END,
    total_volume_kg = v_total_volume
  where id = p_session_id;

  update public.workout_live_state
  set current_state = 'completed'
  where session_log_id = p_session_id;

  return jsonb_build_object(
    'session_id', p_session_id,
    'duration_seconds', v_duration,
    'total_volume_kg', v_total_volume,
    'sets_completed', v_set_count
  );
end $function$;
