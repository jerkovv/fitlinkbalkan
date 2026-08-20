-- Cilj BAS JEDNE serije. Zamenjuje raniji obrazac sa zasebnim dugmetom
-- "Promeni cilj": polje u trenerovoj mrezi je sada cilj dok serija nije
-- cekirana, a upis kad jeste. Trener otkuca 50 kg u praznu seriju 4 i vezbacu
-- se odmah promeni cilj na toj seriji, pa i predlog u "Aktivna serija"
-- (SetLogger sam prati promenu targetReps/targetWeightKg).
--
-- reps je TEKST jer ciljevi umeju da budu raspon ("6-10"), sto je u bazi
-- uobicajeno - integer bi ih tiho unistio.
CREATE OR REPLACE FUNCTION public.trainer_set_set_target(
  p_session_id uuid,
  p_ape_id     uuid,
  p_set_number integer,
  p_reps       text    DEFAULT NULL,
  p_weight     numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_athlete uuid; v_ape uuid; v_sets int; v_rest int;
BEGIN
  v_athlete := public._trainer_edit_guard(p_session_id);

  -- Izmena cilja je izmena PLANA, pa vazi samo za danas.
  PERFORM public._fork_session_plan(p_session_id);
  v_ape := public._session_plan_row(p_session_id, p_ape_id);
  IF v_ape IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u ovom treningu'; END IF;

  SELECT sets, rest_seconds INTO v_sets, v_rest
  FROM public.assigned_program_exercises WHERE id = v_ape;

  IF p_set_number < 1 OR p_set_number > v_sets THEN
    RAISE EXCEPTION 'Serija % ne postoji u ovoj vezbi (ima ih %)', p_set_number, v_sets;
  END IF;

  INSERT INTO public.assigned_program_exercise_sets
    (assigned_exercise_id, set_number, reps, weight_kg, rest_seconds)
  VALUES (v_ape, p_set_number, NULLIF(trim(COALESCE(p_reps, '')), ''), p_weight, v_rest)
  ON CONFLICT (assigned_exercise_id, set_number) DO UPDATE
    SET reps      = COALESCE(NULLIF(trim(COALESCE(p_reps, '')), ''), public.assigned_program_exercise_sets.reps),
        weight_kg = COALESCE(p_weight, public.assigned_program_exercise_sets.weight_kg);

  -- Sazetak na vezbi (npr. "6 x 6-10") prati prvu seriju, da se kartica i
  -- spisak treninga ne raziđu sa per-set ciljevima.
  UPDATE public.assigned_program_exercises
  SET reps      = COALESCE(NULLIF(trim(COALESCE(p_reps, '')), ''), reps),
      weight_kg = COALESCE(p_weight, weight_kg)
  WHERE id = v_ape AND p_set_number = 1;

  -- Podigni plan_version: to je jedini signal vezbacevom telefonu i satu.
  RETURN public._trainer_resync_live(p_session_id, v_athlete)
         || jsonb_build_object('set_number', p_set_number);
END;
$$;

REVOKE ALL ON FUNCTION public.trainer_set_set_target(uuid, uuid, integer, text, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trainer_set_set_target(uuid, uuid, integer, text, numeric) TO authenticated;
