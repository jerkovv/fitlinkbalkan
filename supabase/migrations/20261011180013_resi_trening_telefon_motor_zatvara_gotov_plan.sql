-- Motor zatvara trening po planu kad vezbac pritisne "Zavrsi set" ili "Preskoci", a sve serije su vec upisane.
-- Potpisi i kljucevi odgovora su isti.

CREATE OR REPLACE FUNCTION public._engine_complete_set(p_user_id uuid, p_session_id uuid, p_reps integer, p_weight numeric, p_rpe numeric, p_duration_minutes integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pos jsonb; v_next jsonb; v_rest int; v_rows int; v_day uuid;
BEGIN
  SELECT day_id INTO v_day FROM public.workout_session_logs
   WHERE id = p_session_id AND athlete_id = p_user_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_ended');
  END IF;

  v_pos := public.watch_compute_position(p_session_id);
  IF (v_pos->>'complete')::boolean THEN
    -- Slobodan trening: gotov SPISAK nije gotov TRENING. 'completed' je rec
    -- koju svaki klijent cita kao kraj, pa se tu ne sme reci.
    -- Trening po planu kome je sve vec upisano (trener je potvrdio poslednje serije
    -- ili je obrisao vezbe koje su ostale) nema sledecu seriju: ovde se zatvara.
    -- Ranije je odgovor glasio "completed", a sesija je ostajala ziva i dugme na
    -- telefonu i satu nije radilo nista.
    IF v_day IS NOT NULL THEN
      PERFORM public._finalize_workout_session(p_session_id);
    END IF;
    RETURN jsonb_build_object('success', true, 'note', 'already_done',
      'state', CASE WHEN v_day IS NULL THEN 'free_plan_done' ELSE 'completed' END);
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
    -- SLOBODAN trening: spisak vezbi je gotov, ali trening nije. Vezbac sam
    -- odlucuje, a trener sme i da doda jos vezbi (sesija ostaje is_active).
    IF v_day IS NULL THEN
      UPDATE public.workout_live_state
      SET current_state = 'active',
          rest_ends_at = NULL,
          current_exercise_name = NULL,
          current_exercise_idx = NULL,
          current_set_number = NULL,
          total_sets = 0,
          plan_version = plan_version + 1,   -- jedini signal telefonu i satu
          last_heartbeat = now()
      WHERE session_log_id = p_session_id AND athlete_id = p_user_id;
      RETURN jsonb_build_object('success', true, 'state', 'free_plan_done', 'position', v_next);
    END IF;

    PERFORM public._finalize_workout_session(p_session_id);
    RETURN jsonb_build_object('success', true, 'state', 'completed', 'position', v_next);
  END IF;

  -- Pauza 0 = bez pauze (sledeca vezba u superset krugu ide odmah). Bez ovoga
  -- bi vezbac usred kruga dobio prazno odbrojavanje umesto sledece vezbe.
  UPDATE public.workout_live_state
  SET current_state = CASE WHEN COALESCE(v_rest, 0) > 0 THEN 'rest' ELSE 'active' END,
      current_exercise_idx=(v_next->>'exercise_idx')::int,
      current_set_number=(v_next->>'set_number')::int,
      current_exercise_name=v_next->>'exercise_name',
      total_sets=(v_next->>'total_sets')::int,
      rest_ends_at = CASE WHEN COALESCE(v_rest, 0) > 0
                          THEN now() + (v_rest || ' seconds')::interval END,
      last_heartbeat=now()
  WHERE session_log_id=p_session_id AND athlete_id=p_user_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows=0 THEN RETURN jsonb_build_object('success', false, 'error', 'no_live_row'); END IF;
  RETURN jsonb_build_object(
    'success', true,
    'state', CASE WHEN COALESCE(v_rest, 0) > 0 THEN 'rest' ELSE 'active' END,
    'rest_seconds', v_rest, 'position', v_next);
END $function$;

CREATE OR REPLACE FUNCTION public._engine_skip_rest(p_user_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pos jsonb; v_rows int; v_day uuid;
BEGIN
  SELECT day_id INTO v_day FROM public.workout_session_logs
   WHERE id = p_session_id AND athlete_id = p_user_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_ended');
  END IF;

  v_pos := public.watch_compute_position(p_session_id);
  IF (v_pos->>'complete')::boolean THEN
    -- Isto kao u _engine_complete_set: trening po planu bez preostalih serija se
    -- zatvara, da "Preskoci" ne ostane dugme koje ne radi nista. Slobodan trening
    -- se ne dira, njega zavrsava vezbac.
    IF v_day IS NOT NULL THEN
      PERFORM public._finalize_workout_session(p_session_id);
    END IF;
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
