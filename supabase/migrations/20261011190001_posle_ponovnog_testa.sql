-- Posle ponovnog testa (2026-10-11): kraj zaboravljenog treninga, ispravka serije posle
-- kraja treninga, sledeci dan na satu, i zatvaranje funkcija koje zove samo cron.

-- Kada se trening stvarno zavrsio. Ako poslednjih sat vremena nije upisana nijedna serija
-- i nije stigao puls, trening je zaboravljen ukljucen: kraj je poslednji trag rada, a ne
-- trenutak kad ga je vezbac sutradan ugasio (u istoriji je stajalo po 26 sati).
CREATE OR REPLACE FUNCTION public._kraj_treninga(p_session_id uuid)
 RETURNS timestamptz
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN now() - t.trag > interval '60 minutes' THEN t.trag ELSE now() END
  FROM (
    SELECT GREATEST(
             s.started_at,
             COALESCE((SELECT max(COALESCE(sl.completed_at, sl.created_at)) FROM public.set_logs sl
                        WHERE sl.session_log_id = s.id), s.started_at),
             COALESCE((SELECT LEAST(GREATEST(ls.hr_last_at, ls.watch_last_hr_at), now())
                         FROM public.workout_live_state ls WHERE ls.session_log_id = s.id), s.started_at)
           ) AS trag
    FROM public.workout_session_logs s WHERE s.id = p_session_id
  ) t;
$function$;
REVOKE EXECUTE ON FUNCTION public._kraj_treninga(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._finalize_workout_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.workout_session_logs s
  SET is_active = false,
      -- Vec zatvoren trening zadrzava svoj kraj; zaboravljen se zavrsava kod poslednjeg traga rada.
      completed_at = COALESCE(s.completed_at, public._kraj_treninga(p_session_id)),
      duration_seconds = CASE WHEN s.completed_at IS NOT NULL
        THEN COALESCE(s.duration_seconds, extract(epoch from (s.completed_at - s.started_at))::int)
        ELSE extract(epoch from (public._kraj_treninga(p_session_id) - s.started_at))::int END,
      total_volume_kg = (
        SELECT COALESCE(sum(reps * weight_kg), 0)
        FROM public.set_logs
        WHERE session_log_id = p_session_id AND done = true
      ),
      active_calories = COALESCE(
        NULLIF(s.active_calories, 0),
        (SELECT NULLIF(ls.current_active_calories, 0)
           FROM public.workout_live_state ls
          WHERE ls.session_log_id = p_session_id
          LIMIT 1),
        s.active_calories
      )
  WHERE s.id = p_session_id;

  UPDATE public.workout_live_state
  SET current_state = 'completed'
  WHERE session_log_id = p_session_id;
END
$function$;

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
  v_kraj timestamptz;
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
  -- Zaboravljen trening se zavrsava kod poslednjeg traga rada, ne u trenutku gasenja.
  v_kraj := public._kraj_treninga(p_session_id);
  v_duration := case when v_vec_gotov
    then coalesce(v_session.duration_seconds,
                  extract(epoch from (v_session.completed_at - v_session.started_at))::integer)
    else extract(epoch from (v_kraj - v_session.started_at))::integer end;

  -- Spoj onoga sto je server zabelezio i onoga sto telefon donese na kraju: ranije se
  -- birao duzi niz, pa je drugi propadao (trening od 2h sa 16 minuta pulsa).
  v_serija := public._merge_hr_series(v_session.hr_series, p_hr_series, v_session.started_at);
  select round(avg((e->>1)::numeric))::int, max((e->>1)::int)
    into v_avg, v_max
    from jsonb_array_elements(v_serija) e;

  update public.workout_session_logs
  set
    completed_at = case when v_vec_gotov then completed_at else v_kraj end,
    duration_seconds = v_duration,
    is_active = false,
    live_hr_avg = COALESCE(v_avg, NULLIF(p_hr_avg, 0), live_hr_avg),
    -- Trening bez merenja pulsa nema najveci puls: prazno, ne nula.
    live_hr_max = NULLIF(GREATEST(COALESCE(live_hr_max, 0), COALESCE(NULLIF(p_hr_max, 0), 0), COALESCE(v_max, 0)), 0),
    live_hr_min = COALESCE(NULLIF(p_hr_min, 0), live_hr_min),
    -- Na vec zatvorenom treningu manji zbir ne prepisuje veci (sat meri ceo trening).
    active_calories = CASE WHEN v_vec_gotov
      THEN NULLIF(GREATEST(COALESCE(active_calories, 0), COALESCE(p_active_calories, 0)), 0)
      ELSE COALESCE(NULLIF(p_active_calories, 0), active_calories) END,
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

CREATE OR REPLACE FUNCTION public.athlete_update_set(p_session_id uuid, p_ape_id uuid, p_set_number integer, p_reps integer, p_weight numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ape uuid;
  v_rows int;
  v_gotov boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Ispravka je dozvoljena i pola sata posle kraja: poslednja serija zatvara trening u istom
  -- pozivu, pa omaska u njoj (900 umesto 90 kg) inace ne bi mogla da se ispravi nikad.
  SELECT (completed_at IS NOT NULL) INTO v_gotov FROM public.workout_session_logs
   WHERE id = p_session_id AND athlete_id = v_uid
     AND (is_active = true OR completed_at > now() - interval '30 minutes');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_ended');
  END IF;

  IF p_reps IS NOT NULL AND (p_reps < 0 OR p_reps > 1000) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_reps');
  END IF;
  IF p_weight IS NOT NULL AND (p_weight < 0 OR p_weight > 1000) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_weight');
  END IF;

  v_ape := COALESCE(public._session_plan_row(p_session_id, p_ape_id), p_ape_id);

  UPDATE public.set_logs
  SET reps      = COALESCE(p_reps, reps),
      weight_kg = COALESCE(p_weight, weight_kg)
  WHERE session_log_id = p_session_id
    AND exercise_id IN (v_ape, p_ape_id)
    AND set_number = p_set_number
    AND done = true
    AND logged_by_trainer IS NOT TRUE;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.set_logs
       WHERE session_log_id = p_session_id
         AND exercise_id IN (v_ape, p_ape_id)
         AND set_number = p_set_number
         AND logged_by_trainer = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'trainer_value');
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'not_logged');
  END IF;

  -- Zatvoren trening vec ima sabran teret; posle ispravke se sabira ponovo.
  IF v_gotov THEN
    UPDATE public.workout_session_logs s
       SET total_volume_kg = (SELECT COALESCE(sum(reps * weight_kg), 0) FROM public.set_logs
                               WHERE session_log_id = p_session_id AND done = true)
     WHERE s.id = p_session_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'set_number', p_set_number);
END;
$function$;

CREATE OR REPLACE FUNCTION public.watch_list_workouts(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Isto pravilo kao na telefonu (get_next_workout_day): sledeci POSTOJECI dan posle
  -- poslednjeg odradjenog, inace prvi postojeci. Racun po ostatku je posle brisanja dana
  -- pokazivao na dan koga nema.
  select min(apd.day_number) into v_next_day
  from public.assigned_program_days apd
  where apd.assigned_program_id = v_prog_id and apd.deleted_at is null
    and apd.day_number > coalesce(v_last_day, -2147483648);
  if v_next_day is null then
    select min(apd.day_number) into v_next_day
    from public.assigned_program_days apd
    where apd.assigned_program_id = v_prog_id and apd.deleted_at is null;
  end if;
  v_next_day := coalesce(v_next_day, 1);

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

-- Ove funkcije zove samo cron (ili niko): gost i prijavljen korisnik nemaju sta da traze.
-- check_membership_expirations je stari podsetnik koji je mogao da napravi duple poruke.
REVOKE EXECUTE ON FUNCTION public.check_membership_expirations() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_send_expiry_reminders() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.advance_expired_rests() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_exercise_popularity() FROM PUBLIC, anon, authenticated;
