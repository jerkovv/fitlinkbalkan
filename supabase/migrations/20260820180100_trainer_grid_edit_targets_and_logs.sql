-- Trenerova mreza: menja CILJ (koliko serija/kg/ponavljanja treba) i UPIS
-- (koliko je stvarno dignuto), u bilo kojoj celiji, i posle zavrsetka treninga.

-- Cuvar za izmene: isto kao _trainer_session_guard, ali BEZ uslova da je trening
-- ziv. Trener sme da ispravi i zavrsen trening ("koliko je stvarno digao"),
-- sto je bila izricita zelja - stara verzija je posle kraja treninga sve odbijala.
CREATE OR REPLACE FUNCTION public._trainer_edit_guard(p_session_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_athlete uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni'; END IF;
  PERFORM public.require_active_trainer_sub();

  SELECT s.athlete_id INTO v_athlete
  FROM public.workout_session_logs s WHERE s.id = p_session_id;

  IF v_athlete IS NULL THEN RAISE EXCEPTION 'Trening ne postoji'; END IF;
  IF NOT public.is_my_athlete(v_uid, v_athlete) THEN
    RAISE EXCEPTION 'Nije tvoj vezbac';
  END IF;
  RETURN v_athlete;
END;
$$;

-- Vraca red plana OVOG treninga za dati id (racvan ili sablonski), uz proveru
-- da uopste pripada ovom treningu.
CREATE OR REPLACE FUNCTION public._session_plan_row(p_session_id uuid, p_ape_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_ape uuid; v_day uuid;
BEGIN
  v_ape := public._session_ape(p_session_id, p_ape_id);
  IF v_ape IS NOT NULL THEN RETURN v_ape; END IF;

  SELECT s.day_id INTO v_day FROM public.workout_session_logs s WHERE s.id = p_session_id;
  IF EXISTS (SELECT 1 FROM public.assigned_program_exercises ape
             WHERE ape.id = p_ape_id AND ape.day_id = v_day AND ape.deleted_at IS NULL)
  THEN RETURN p_ape_id; END IF;

  RETURN NULL;
END;
$$;

-- Kraj treninga je vezbacev potez, pa resync vise NIKAD ne finalizuje sam.
-- Ako je posle izmene sve odradjeno, vezbacev sledeci klik dobija 'completed'.
-- Tolerantan je i na trening bez zivog reda (zavrsen) - tada samo nema sta da
-- upise i to nije greska.
CREATE OR REPLACE FUNCTION public._trainer_resync_live(p_session_id uuid, p_athlete uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_next jsonb;
BEGIN
  v_next := public.watch_compute_position(p_session_id);

  IF (v_next->>'complete')::boolean THEN
    UPDATE public.workout_live_state
    SET plan_version = plan_version + 1
    WHERE session_log_id = p_session_id AND athlete_id = p_athlete;
    RETURN jsonb_build_object('success', true, 'state', 'plan_complete');
  END IF;

  -- current_state se NAMERNO ne dira: izmena plana ne sme da izbaci vezbaca iz
  -- pauze niti da ga u nju gurne.
  UPDATE public.workout_live_state
  SET current_exercise_idx = (v_next->>'exercise_idx')::int,
      current_set_number   = (v_next->>'set_number')::int,
      current_exercise_name= v_next->>'exercise_name',
      total_sets           = (v_next->>'total_sets')::int,
      plan_version         = plan_version + 1
  WHERE session_log_id = p_session_id AND athlete_id = p_athlete;

  RETURN jsonb_build_object('success', true, 'position', v_next);
END;
$$;

-- UPIS u bilo koju celiju mreze (i posle zavrsetka treninga).
-- Ne dira zivi red - tempo je vezbacev.
CREATE OR REPLACE FUNCTION public.trainer_log_set(
  p_session_id uuid,
  p_ape_id     uuid,
  p_set_number integer,
  p_reps       integer DEFAULT NULL,
  p_weight     numeric DEFAULT NULL,
  p_rpe        numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_athlete uuid; v_ape uuid; v_sets int;
BEGIN
  v_athlete := public._trainer_edit_guard(p_session_id);

  v_ape := public._session_plan_row(p_session_id, p_ape_id);
  IF v_ape IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u ovom treningu'; END IF;

  SELECT sets INTO v_sets FROM public.assigned_program_exercises WHERE id = v_ape;
  IF p_set_number < 1 OR p_set_number > v_sets THEN
    RAISE EXCEPTION 'Serija % ne postoji u ovoj vezbi (ima ih %)', p_set_number, v_sets;
  END IF;

  INSERT INTO public.set_logs (
    session_log_id, exercise_id, set_number, reps, weight_kg, rpe,
    done, started_at, completed_at, logged_by_trainer
  )
  VALUES (p_session_id, v_ape, p_set_number, p_reps, p_weight, p_rpe,
          true, now(), now(), true)
  ON CONFLICT (session_log_id, exercise_id, set_number) DO UPDATE
    SET reps = EXCLUDED.reps,
        weight_kg = EXCLUDED.weight_kg,
        rpe = COALESCE(EXCLUDED.rpe, public.set_logs.rpe),
        done = true,
        completed_at = now(),
        logged_by_trainer = true;

  RETURN jsonb_build_object('success', true, 'set_number', p_set_number);
END;
$$;

-- Ponistavanje upisa (odcekiranje u mrezi).
CREATE OR REPLACE FUNCTION public.trainer_unlog_set(
  p_session_id uuid, p_ape_id uuid, p_set_number integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_athlete uuid; v_ape uuid; v_rows int;
BEGIN
  v_athlete := public._trainer_edit_guard(p_session_id);

  v_ape := public._session_plan_row(p_session_id, p_ape_id);
  IF v_ape IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u ovom treningu'; END IF;

  DELETE FROM public.set_logs
  WHERE session_log_id = p_session_id AND exercise_id = v_ape AND set_number = p_set_number;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RAISE EXCEPTION 'Ta serija nije upisana'; END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public._trainer_edit_guard(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._trainer_edit_guard(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public._session_plan_row(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._session_plan_row(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.trainer_log_set(uuid, uuid, integer, integer, numeric, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trainer_log_set(uuid, uuid, integer, integer, numeric, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.trainer_unlog_set(uuid, uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trainer_unlog_set(uuid, uuid, integer) TO authenticated;
