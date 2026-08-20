-- CILJ vezbe za danas: koliko serija, ponavljanja i kila TREBA da uradi.
-- NULL = ne diraj to polje. Izmena cilja je izmena PLANA, pa se trening racva
-- i vazi samo za danas.
--
-- Postuje okidac trg_cardio_single_set, koji kardio vezbe (is_duration_based)
-- drzi na tacno jednoj seriji jer se one mere minutima: broj serija se cita
-- NAZAD iz tabele posle upisa. Bez toga bi funkcija za traku vratila "4 serije"
-- i napravila tri per-set reda viska, dok u tabeli i dalje stoji jedna.
CREATE OR REPLACE FUNCTION public.trainer_set_exercise_target(
  p_session_id uuid,
  p_ape_id     uuid,
  p_sets       integer DEFAULT NULL,
  p_reps       integer DEFAULT NULL,
  p_weight     numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_athlete uuid; v_ape uuid;
  v_stare int; v_trazeno int; v_stvarno int; v_max_log int;
  v_reps text; v_rest int;
BEGIN
  v_athlete := public._trainer_edit_guard(p_session_id);

  PERFORM public._fork_session_plan(p_session_id);
  v_ape := public._session_plan_row(p_session_id, p_ape_id);
  IF v_ape IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u ovom treningu'; END IF;

  SELECT sets INTO v_stare FROM public.assigned_program_exercises WHERE id = v_ape;
  v_trazeno := COALESCE(p_sets, v_stare);
  IF v_trazeno < 1 THEN RAISE EXCEPTION 'Vezba mora imati bar jednu seriju'; END IF;

  -- Smanjenje ispod vec upisane serije bi ostavilo upis van plana.
  SELECT COALESCE(max(set_number), 0) INTO v_max_log
  FROM public.set_logs WHERE session_log_id = p_session_id AND exercise_id = v_ape;
  IF v_trazeno < v_max_log THEN
    RAISE EXCEPTION 'Vec je upisana serija %, ne moze manje od toga', v_max_log;
  END IF;

  UPDATE public.assigned_program_exercises
  SET sets      = v_trazeno,
      reps      = COALESCE(p_reps::text, reps),
      weight_kg = COALESCE(p_weight, weight_kg)
  WHERE id = v_ape;

  -- Procitaj STVARNO upisan broj serija - okidac ga je za kardio mogao vratiti na 1.
  SELECT sets, reps, rest_seconds INTO v_stvarno, v_reps, v_rest
  FROM public.assigned_program_exercises WHERE id = v_ape;

  -- Per-set ciljevi su izvor istine za vezbacev ekran, pa se poravnaju sa njim.
  DELETE FROM public.assigned_program_exercise_sets
  WHERE assigned_exercise_id = v_ape AND set_number > v_stvarno;

  INSERT INTO public.assigned_program_exercise_sets
    (assigned_exercise_id, set_number, reps, weight_kg, rest_seconds)
  SELECT v_ape, n, v_reps, p_weight, v_rest
  FROM generate_series(1, v_stvarno) AS n
  WHERE NOT EXISTS (
    SELECT 1 FROM public.assigned_program_exercise_sets aps
    WHERE aps.assigned_exercise_id = v_ape AND aps.set_number = n
  );

  IF p_reps IS NOT NULL OR p_weight IS NOT NULL THEN
    UPDATE public.assigned_program_exercise_sets
    SET reps      = COALESCE(p_reps::text, reps),
        weight_kg = COALESCE(p_weight, weight_kg)
    WHERE assigned_exercise_id = v_ape;
  END IF;

  RETURN public._trainer_resync_live(p_session_id, v_athlete)
         || jsonb_build_object('sets', v_stvarno,
                               'requested_sets', v_trazeno,
                               'capped', v_stvarno <> v_trazeno);
END;
$$;

REVOKE ALL ON FUNCTION public.trainer_set_exercise_target(uuid, uuid, integer, integer, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trainer_set_exercise_target(uuid, uuid, integer, integer, numeric) TO authenticated;
