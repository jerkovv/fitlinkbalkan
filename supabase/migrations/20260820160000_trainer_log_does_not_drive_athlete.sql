-- Trenerov upis serije VISE NE VODI vezbacev trening.
--
-- Do sada je trainer_log_next_set na kraju radio isti upis u zivi red kao
-- _engine_complete_set: current_state='rest' + rest_ends_at. Posledica je bila
-- da trener, cim upise kilazu, vezbacu na telefonu i satu obori trening u pauzu
-- i pomeri ga na sledecu seriju - kao da je vezbac sam kliknuo "Zavrsi set".
--
-- To je pogresno. Trener belezi STA JE DIGNUTO; tempo treninga je vezbacev.
-- Ostaje samo upis u set_logs, ziva pozicija se ne dira.
--
-- Ne zove se ni _finalize_workout_session: kraj treninga je takodje vezbacev
-- potez (athlete_finish_workout, odnosno njegova poslednja serija). Ako trener
-- popuni bas sve serije, vezbacev sledeci klik dobije 'completed' i klijent ga
-- odvede na rezime - ta putanja je vec postojala.
CREATE OR REPLACE FUNCTION public.trainer_log_next_set(
  p_session_id       uuid,
  p_reps             integer DEFAULT NULL,
  p_weight           numeric DEFAULT NULL,
  p_rpe              numeric DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_athlete uuid;
  v_pos jsonb;
BEGIN
  v_athlete := public._trainer_session_guard(p_session_id);

  v_pos := public.watch_compute_position(p_session_id);
  IF (v_pos->>'complete')::boolean THEN
    RETURN jsonb_build_object('success', true, 'state', 'completed', 'note', 'already_done');
  END IF;

  -- DO UPDATE (ne DO NOTHING kao kod vezbaca): ako je vezbac u istoj sekundi
  -- upisao isti set, trenerov broj je taj koji ostaje.
  INSERT INTO public.set_logs (
    session_log_id, exercise_id, set_number, reps, weight_kg, rpe,
    duration_minutes, done, started_at, completed_at, logged_by_trainer
  )
  VALUES (
    p_session_id, (v_pos->>'ape_id')::uuid, (v_pos->>'set_number')::int,
    CASE WHEN p_duration_minutes IS NOT NULL THEN NULL
         ELSE COALESCE(p_reps, (v_pos->>'planned_reps')::int) END,
    CASE WHEN p_duration_minutes IS NOT NULL THEN NULL
         ELSE COALESCE(p_weight, (v_pos->>'planned_weight')::numeric, 0) END,
    p_rpe, p_duration_minutes, true, now(), now(), true
  )
  ON CONFLICT (session_log_id, exercise_id, set_number) DO UPDATE
    SET reps = EXCLUDED.reps,
        weight_kg = EXCLUDED.weight_kg,
        rpe = EXCLUDED.rpe,
        duration_minutes = EXCLUDED.duration_minutes,
        done = true,
        completed_at = now(),
        logged_by_trainer = true;

  -- NAMERNO bez ijednog upisa u workout_live_state: ni pozicije, ni pauze, ni
  -- last_heartbeat (heartbeat je znak da je vezbac ziv, ne trener).
  RETURN jsonb_build_object('success', true, 'logged', v_pos);
END;
$$;
