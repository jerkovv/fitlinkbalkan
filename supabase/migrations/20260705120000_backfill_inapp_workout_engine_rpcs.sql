-- =====================================================================
-- BACKFILL / DRIFT-CAPTURE MIGRATION  (version control only — NE DEPLOYUJE SE)
-- In-app "atleta" live-workout engine + drift-capture.
--
-- Ove funkcije vec postoje u produkciji (project iyvvskywmqtudafapxdk),
-- primenjene ranije direktno preko MCP-a, ali NEMAJU migracioni fajl (ili je
-- prod verzija odlutala od poslednje migracije). Hvatamo ih VERBATIM
-- (pg_get_functiondef) radi reproducibilnosti sheme. Ponasanje se NE menja.
--
-- Poziva ih klijent src/pages/athlete/ActiveWorkout.tsx:
--   athlete_complete_set / athlete_skip_rest / athlete_extend_rest /
--   athlete_heartbeat / athlete_finish_workout / cancel_workout_session /
--   athlete_effective_max_hr   (+ get_inapp_workout_detail za detalj treninga)
-- interni engine/helper lanac:
--   _engine_complete_set -> _finalize_workout_session, watch_compute_position
--   _engine_skip_rest / _engine_extend_rest / _finalize_workout_session /
--   _compute_hr_zones
--
-- DVA DRIFT slucaja (prod != poslednja migracija):
--   * _engine_complete_set     (+p_duration_minutes, dodat posle 20260614101356)
--   * get_inapp_workout_detail (poziva novi _compute_hr_zones; posle 20260622114845)
--
-- Grantovi verbatim prema prod ACL-u (public, anon, authenticated,
-- service_role); ove role ionako dobijaju EXECUTE i preko Supabase default
-- privileges nad schema public.
-- =====================================================================

-- 1) Public wrapperi (klijent ih zove) ------------------------------

CREATE OR REPLACE FUNCTION public.athlete_complete_set(p_session_id uuid, p_reps integer DEFAULT NULL::integer, p_weight numeric DEFAULT NULL::numeric, p_rpe numeric DEFAULT NULL::numeric, p_duration_minutes integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  RETURN public._engine_complete_set(v_user_id, p_session_id, p_reps, p_weight, p_rpe, p_duration_minutes);
END $function$;
GRANT EXECUTE ON FUNCTION public.athlete_complete_set(p_session_id uuid, p_reps integer, p_weight numeric, p_rpe numeric, p_duration_minutes integer) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.athlete_skip_rest(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  RETURN public._engine_skip_rest(v_user_id, p_session_id);
END $function$;
GRANT EXECUTE ON FUNCTION public.athlete_skip_rest(p_session_id uuid) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.athlete_extend_rest(p_session_id uuid, p_seconds integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  RETURN public._engine_extend_rest(v_user_id, p_session_id, p_seconds);
END $function$;
GRANT EXECUTE ON FUNCTION public.athlete_extend_rest(p_session_id uuid, p_seconds integer) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.athlete_heartbeat(p_session_id uuid, p_hr integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid := auth.uid(); v_rows int;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  UPDATE public.workout_live_state
  SET last_heartbeat = now(),
      current_hr = COALESCE(p_hr, current_hr)
  WHERE session_log_id = p_session_id
    AND athlete_id = v_user_id
    AND current_state IN ('active','rest');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('success', v_rows > 0);
END $function$;
GRANT EXECUTE ON FUNCTION public.athlete_heartbeat(p_session_id uuid, p_hr integer) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.athlete_finish_workout(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  RETURN public._engine_finish_workout(v_user_id, p_session_id);
END $function$;
GRANT EXECUTE ON FUNCTION public.athlete_finish_workout(p_session_id uuid) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.athlete_effective_max_hr(p_athlete_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT c.max_hr FROM public.user_hr_config c WHERE c.user_id = p_athlete_id),
    (SELECT CASE WHEN a.birth_year IS NOT NULL
                 THEN 220 - (EXTRACT(year FROM now())::int - a.birth_year)
            END
     FROM public.athletes a WHERE a.id = p_athlete_id)
  );
$function$;
GRANT EXECUTE ON FUNCTION public.athlete_effective_max_hr(p_athlete_id uuid) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_workout_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.set_logs 
  where session_log_id = p_session_id;
  
  delete from public.workout_session_logs
  where id = p_session_id and athlete_id = auth.uid();
end $function$;
GRANT EXECUTE ON FUNCTION public.cancel_workout_session(p_session_id uuid) TO public, anon, authenticated, service_role;

-- 2) Engine / helper lanac -----------------------------------------

-- DRIFT: prod verzija ima 6. parametar (p_duration_minutes integer DEFAULT NULL),
-- dodat direktno preko MCP-a POSLE migracije 20260614101356 (koja jos drzi stari
-- 5-arg potpis). Bacamo stari overload da fresh replay ostane 1:1 sa prod-om.
DROP FUNCTION IF EXISTS public._engine_complete_set(p_user_id uuid, p_session_id uuid, p_reps integer, p_weight numeric, p_rpe numeric);
CREATE OR REPLACE FUNCTION public._engine_complete_set(p_user_id uuid, p_session_id uuid, p_reps integer, p_weight numeric, p_rpe numeric, p_duration_minutes integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pos jsonb; v_next jsonb; v_rest int; v_rows int;
BEGIN
  PERFORM 1 FROM public.workout_session_logs
   WHERE id = p_session_id AND athlete_id = p_user_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_ended');
  END IF;

  v_pos := public.watch_compute_position(p_session_id);
  IF (v_pos->>'complete')::boolean THEN
    RETURN jsonb_build_object('success', true, 'state', 'completed', 'note', 'already_done');
  END IF;

  INSERT INTO public.set_logs (session_log_id, exercise_id, set_number, reps, weight_kg, rpe, duration_minutes, done, started_at, completed_at)
  VALUES (p_session_id, (v_pos->>'ape_id')::uuid, (v_pos->>'set_number')::int,
          CASE WHEN p_duration_minutes IS NOT NULL THEN NULL ELSE COALESCE(p_reps, (v_pos->>'planned_reps')::int) END,
          CASE WHEN p_duration_minutes IS NOT NULL THEN NULL ELSE COALESCE(p_weight, (v_pos->>'planned_weight')::numeric, 0) END,
          p_rpe, p_duration_minutes, true, now(), now())
  ON CONFLICT (session_log_id, exercise_id, set_number) DO NOTHING;

  v_rest := (v_pos->>'rest_seconds')::int;
  v_next := public.watch_compute_position(p_session_id);

  IF (v_next->>'complete')::boolean THEN
    PERFORM public._finalize_workout_session(p_session_id);
    RETURN jsonb_build_object('success', true, 'state', 'completed', 'position', v_next);
  END IF;

  UPDATE public.workout_live_state
  SET current_state='rest',
      current_exercise_idx=(v_next->>'exercise_idx')::int,
      current_set_number=(v_next->>'set_number')::int,
      current_exercise_name=v_next->>'exercise_name',
      total_sets=(v_next->>'total_sets')::int,
      rest_ends_at=now() + (v_rest || ' seconds')::interval,
      last_heartbeat=now()
  WHERE session_log_id=p_session_id AND athlete_id=p_user_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows=0 THEN RETURN jsonb_build_object('success', false, 'error', 'no_live_row'); END IF;
  RETURN jsonb_build_object('success', true, 'state', 'rest', 'rest_seconds', v_rest, 'position', v_next);
END $function$;
GRANT EXECUTE ON FUNCTION public._engine_complete_set(p_user_id uuid, p_session_id uuid, p_reps integer, p_weight numeric, p_rpe numeric, p_duration_minutes integer) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._engine_skip_rest(p_user_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pos jsonb; v_rows int;
BEGIN
  PERFORM 1 FROM public.workout_session_logs
   WHERE id = p_session_id AND athlete_id = p_user_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_ended');
  END IF;

  v_pos := public.watch_compute_position(p_session_id);
  IF (v_pos->>'complete')::boolean THEN
    RETURN jsonb_build_object('success', true, 'state', 'completed', 'position', v_pos);
  END IF;

  UPDATE public.workout_live_state
  SET current_state='active',
      current_exercise_idx=(v_pos->>'exercise_idx')::int,
      current_set_number=(v_pos->>'set_number')::int,
      current_exercise_name=v_pos->>'exercise_name',
      total_sets=(v_pos->>'total_sets')::int,
      rest_ends_at=NULL,
      last_heartbeat=now()
  WHERE session_log_id=p_session_id AND athlete_id=p_user_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows=0 THEN RETURN jsonb_build_object('success', false, 'error', 'no_live_row'); END IF;
  RETURN jsonb_build_object('success', true, 'state', 'active', 'position', v_pos);
END $function$;
GRANT EXECUTE ON FUNCTION public._engine_skip_rest(p_user_id uuid, p_session_id uuid) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._engine_extend_rest(p_user_id uuid, p_session_id uuid, p_seconds integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rows int; v_new_ms bigint;
BEGIN
  IF abs(p_seconds) > 600 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_seconds');
  END IF;

  PERFORM 1 FROM public.workout_session_logs
   WHERE id = p_session_id AND athlete_id = p_user_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_ended');
  END IF;

  -- Produzi samo ako smo u odmoru. Apsolutni kraj + delta.
  UPDATE public.workout_live_state
  SET rest_ends_at = COALESCE(rest_ends_at, now()) + (p_seconds || ' seconds')::interval,
      last_heartbeat = now()
  WHERE session_log_id = p_session_id
    AND athlete_id = p_user_id
    AND current_state = 'rest'
  RETURNING (extract(epoch FROM rest_ends_at)*1000)::bigint INTO v_new_ms;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_in_rest');
  END IF;

  RETURN jsonb_build_object('success', true, 'rest_ends_at_ms', v_new_ms);
END $function$;
GRANT EXECUTE ON FUNCTION public._engine_extend_rest(p_user_id uuid, p_session_id uuid, p_seconds integer) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._finalize_workout_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.workout_session_logs s
  SET is_active = false,
      completed_at = now(),
      duration_seconds = extract(epoch from (now() - s.started_at))::int,
      total_volume_kg = (
        SELECT COALESCE(sum(reps * weight_kg), 0)
        FROM public.set_logs
        WHERE session_log_id = p_session_id AND done = true
      )
  WHERE s.id = p_session_id;

  UPDATE public.workout_live_state
  SET current_state = 'completed'
  WHERE session_log_id = p_session_id;
END $function$;
GRANT EXECUTE ON FUNCTION public._finalize_workout_session(p_session_id uuid) TO public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._compute_hr_zones(p_hr_series jsonb, p_max_hr integer)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  with names(zone, zone_name) as (
    values (1,'Lagano'),(2,'Aerobno'),(3,'Tempo'),(4,'Anaerobno'),(5,'Maksimalno')
  ),
  bounds as (
    select n.zone, n.zone_name,
           round((coalesce(p_max_hr,0) * (0.4 + 0.1*n.zone))::numeric)::int as min_bpm,
           round((coalesce(p_max_hr,0) * (0.5 + 0.1*n.zone))::numeric)::int as max_bpm
    from names n
  ),
  samples as (
    select (elem->>0)::numeric as t,
           (elem->>1)::numeric as hr
    from jsonb_array_elements(
           case when jsonb_typeof(p_hr_series) = 'array' then p_hr_series else '[]'::jsonb end
         ) as e(elem)
    where jsonb_typeof(elem) = 'array'
      and (elem->>1) ~ '^[0-9]+(\.[0-9]+)?$'
      and (elem->>0) ~ '^[0-9]+(\.[0-9]+)?$'
  ),
  durated as (
    select hr,
           greatest(0, least(coalesce(lead(t) over (order by t) - t, 2), 30)) as dur
    from samples
  ),
  zoned as (
    select case
             when coalesce(p_max_hr,0) <= 0 then 0
             when hr >= round((p_max_hr*0.9)::numeric) then 5
             when hr >= round((p_max_hr*0.8)::numeric) then 4
             when hr >= round((p_max_hr*0.7)::numeric) then 3
             when hr >= round((p_max_hr*0.6)::numeric) then 2
             when hr >= round((p_max_hr*0.5)::numeric) then 1
             else 0
           end as zone,
           dur
    from durated
  ),
  agg as (
    select zone, sum(dur)::int as secs
    from zoned
    where zone between 1 and 5
    group by zone
  )
  select jsonb_agg(
           jsonb_build_object(
             'zone', b.zone,
             'zone_name', b.zone_name,
             'min_bpm', b.min_bpm,
             'max_bpm', b.max_bpm,
             'seconds_in_zone', coalesce(a.secs, 0)
           ) order by b.zone
         )
  from bounds b
  left join agg a on a.zone = b.zone;
$function$;
GRANT EXECUTE ON FUNCTION public._compute_hr_zones(p_hr_series jsonb, p_max_hr integer) TO public, anon, authenticated, service_role;

-- 3) Drift-capture: detalj treninga sada racuna HR zone -------------

-- DRIFT: prod verzija (posle 20260622114845) racuna max_hr i zove novi
-- public._compute_hr_zones(...) -> vraca 'max_hr' i 'zones' u odgovoru.
-- Definisano posle _compute_hr_zones iznad (helper mora postojati).
CREATE OR REPLACE FUNCTION public.get_inapp_workout_detail(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_athlete uuid;
  v_day_id uuid;
  v_result jsonb;
  v_exercises jsonb;
  v_cfg_max int;
  v_birth_year int;
  v_max_hr int;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT athlete_id, day_id INTO v_athlete, v_day_id
  FROM public.workout_session_logs WHERE id = p_session_id;
  IF v_athlete IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_caller <> v_athlete AND NOT EXISTS (
    SELECT 1 FROM public.athletes a WHERE a.id = v_athlete AND a.trainer_id = v_caller
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  -- Max puls za zone: rucno podeseno ako postoji, inace 220 minus godine, inace fallback 190
  SELECT max_hr INTO v_cfg_max FROM public.user_hr_config WHERE user_id = v_athlete AND max_hr > 0;
  SELECT birth_year INTO v_birth_year FROM public.athletes WHERE id = v_athlete;
  v_max_hr := COALESCE(
    v_cfg_max,
    CASE WHEN v_birth_year IS NOT NULL AND v_birth_year > 1900
         THEN 220 - (EXTRACT(YEAR FROM now())::int - v_birth_year)
         ELSE 190 END
  );
  IF v_max_hr IS NULL OR v_max_hr < 100 THEN v_max_hr := 190; END IF;

  -- Spisak vezbi sa planom (sazetak + per-set ciljevi) i uradjenim serijama
  SELECT jsonb_agg(ex_row ORDER BY ex_pos) INTO v_exercises
  FROM (
    SELECT ape.position AS ex_pos,
      jsonb_build_object(
        'exercise_name', COALESCE(e.name, 'Vezba'),
        'planned_sets', ape.sets,
        'planned_reps', ape.reps,
        'planned_weight_kg', ape.weight_kg,
        'planned_duration_minutes', ape.duration_minutes,
        'is_duration_based', COALESCE(e.is_duration_based, false),
        'planned_set_details', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'set_number', aps.set_number,
            'reps', aps.reps,
            'weight_kg', aps.weight_kg,
            'rest_seconds', aps.rest_seconds
          ) ORDER BY aps.set_number)
          FROM public.assigned_program_exercise_sets aps
          WHERE aps.assigned_exercise_id = ape.id
        ), '[]'::jsonb),
        'sets', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'set_number', sl.set_number,
            'reps', sl.reps,
            'weight_kg', sl.weight_kg,
            'rpe', sl.rpe,
            'duration_minutes', sl.duration_minutes,
            'done', sl.done
          ) ORDER BY sl.set_number)
          FROM public.set_logs sl
          WHERE sl.session_log_id = p_session_id AND sl.exercise_id = ape.id
        ), '[]'::jsonb),
        'done_count', (
          SELECT count(*) FROM public.set_logs sl
          WHERE sl.session_log_id = p_session_id AND sl.exercise_id = ape.id AND sl.done = true
        )
      ) AS ex_row
    FROM public.assigned_program_exercises ape
    LEFT JOIN public.exercises e ON e.id = ape.exercise_id
    WHERE ape.day_id = v_day_id
  ) sub;

  SELECT jsonb_build_object(
    'success', true,
    'id', s.id,
    'day_number', s.day_number,
    'started_at', s.started_at,
    'completed_at', s.completed_at,
    'duration_seconds', s.duration_seconds,
    'total_volume_kg', s.total_volume_kg,
    'active_calories', s.active_calories,
    'hr_avg', s.live_hr_avg,
    'hr_max', s.live_hr_max,
    'hr_series', s.hr_series,
    'max_hr', v_max_hr,
    'zones', public._compute_hr_zones(s.hr_series, v_max_hr),
    'notes', s.notes,
    'program_name', ap.name,
    'day_name', ad.name,
    'birth_year', ath.birth_year,
    'sets_done', (SELECT count(*) FROM public.set_logs sl WHERE sl.session_log_id = s.id AND sl.done = true),
    'exercises', COALESCE(v_exercises, '[]'::jsonb)
  ) INTO v_result
  FROM public.workout_session_logs s
  LEFT JOIN public.assigned_programs ap ON ap.id = s.assigned_program_id
  LEFT JOIN public.assigned_program_days ad ON ad.id = s.day_id
  LEFT JOIN public.athletes ath ON ath.id = s.athlete_id
  WHERE s.id = p_session_id;

  RETURN v_result;
END $function$;
GRANT EXECUTE ON FUNCTION public.get_inapp_workout_detail(p_session_id uuid) TO public, anon, authenticated, service_role;
