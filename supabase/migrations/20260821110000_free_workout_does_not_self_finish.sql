-- Slobodan trening se vise ne zatvara sam kad se odradi poslednja serija.
--
-- Do sada je _engine_complete_set bezuslovno finalizovao cim plan postane
-- gotov, bez obzira da li je trening planiran ili slobodan. U bazi se to vidi:
-- kod tri slobodna treninga sa vezbama razlika completed_at minus poslednja
-- serija je TACNO 0.0 sekundi - sesija je pukla u istoj transakciji kao
-- poslednja serija. Jedan od njih je trajao 2h31m. Covek koji je odradio ono
-- sto mu je trener dao, a hoce da nastavi da trci, biva izbacen na rezime i
-- stoperica mu stane.
--
-- Planiran trening zadrzava staro ponasanje: tamo je kraj plana zaista kraj
-- treninga, i ActiveWorkout na to racuna.
--
-- Za slobodan: zivi red se vraca u oblik koji mu daje _start_free_workout_session
-- (bez tekuce vezbe), pa sesija ostaje ZIVA. current_state ide na 'active', ne na
-- neko novo stanje: CHECK dozvoljava samo active/rest/completed, a athlete_poll_state
-- i watch_poll_state oba filtriraju IN ('active','rest') - novo stanje bi za oba
-- uredjaja izgledalo kao "nema sesije". 'free_plan_done' je samo vrednost u
-- odgovoru RPC-a, nikad u bazi.
CREATE OR REPLACE FUNCTION public._engine_complete_set(
  p_user_id uuid, p_session_id uuid, p_reps integer, p_weight numeric,
  p_rpe numeric, p_duration_minutes integer DEFAULT NULL::integer
)
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
