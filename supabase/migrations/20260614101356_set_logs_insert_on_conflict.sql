-- _engine_complete_set: ON CONFLICT (session_log_id, exercise_id, set_number) DO NOTHING,
-- da trka sat+telefon na isti set log ne obori upis (duplikat se tiho preskoci).
-- Vec primenjeno na bazu preko MCP; ovaj fajl je samo za version control.

CREATE OR REPLACE FUNCTION public._engine_complete_set(p_user_id uuid, p_session_id uuid, p_reps integer, p_weight numeric, p_rpe numeric)
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

  INSERT INTO public.set_logs (session_log_id, exercise_id, set_number, reps, weight_kg, rpe, done, started_at, completed_at)
  VALUES (p_session_id, (v_pos->>'ape_id')::uuid, (v_pos->>'set_number')::int,
          COALESCE(p_reps, (v_pos->>'planned_reps')::int),
          COALESCE(p_weight, (v_pos->>'planned_weight')::numeric, 0),
          p_rpe, true, now(), now())
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
END $function$
;
