-- Slobodan trening dobija vezbe.
--
-- Do sada je bio zid: cuvar je odbijao svaki trening bez day_id, jer vezbe
-- vise o DANU, a slobodan trening dana nema. Otkad sesija ume da drzi svoje
-- vezbe (day_id NULL + session_log_id), zid vise nema smisla - slobodan
-- trening je prosto sesija koja krece prazna. To je 138 od 449 treninga (31%).
--
-- day_id ostaje NULL, pa trening i dalje ostaje "Slobodan trening" u istoriji
-- (InAppWorkoutsList i Progress ga tako i prepoznaju).
CREATE OR REPLACE FUNCTION public._trainer_session_guard(p_session_id uuid)
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
  FROM public.workout_session_logs s
  WHERE s.id = p_session_id AND s.is_active = true;

  IF v_athlete IS NULL THEN RAISE EXCEPTION 'Trening nije aktivan'; END IF;
  IF NOT public.is_my_athlete(v_uid, v_athlete) THEN
    RAISE EXCEPTION 'Nije tvoj vezbac';
  END IF;

  -- Uslov "mora imati day_id" je NAMERNO uklonjen: slobodan trening sme da
  -- dobije vezbe, koje se upisuju kao vezbe sesije.
  RETURN v_athlete;
END;
$$;

-- Plan po SESIJI, ne po danu.
--
-- get_workout_day_full trazi day_id, pa za slobodan trening nema sta da vrati.
-- Ovaj RPC radi za oba slucaja: ako sesija ima svoje vezbe vraca njih, inace
-- pada na sablon dana (ako dana uopste ima).
CREATE OR REPLACE FUNCTION public.get_session_plan_full(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_athlete uuid; v_day uuid; v_racvan boolean := false;
  v_glava jsonb; v_exercises jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT s.athlete_id, s.day_id INTO v_athlete, v_day
  FROM public.workout_session_logs s WHERE s.id = p_session_id;
  IF v_athlete IS NULL THEN RETURN NULL; END IF;

  -- Vidi ga vezbac i njegov trener, niko drugi.
  IF v_uid <> v_athlete AND NOT public.is_my_athlete(v_uid, v_athlete) THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.assigned_program_exercises
                 WHERE session_log_id = p_session_id) INTO v_racvan;

  SELECT jsonb_build_object(
    'session_id', p_session_id,
    'day_id', v_day,
    'day_number', d.day_number,
    'day_name', COALESCE(d.name, 'Slobodan trening'),
    'assigned_program_id', d.assigned_program_id,
    'is_free', v_day IS NULL
  ) INTO v_glava
  FROM (SELECT 1) x
  LEFT JOIN public.assigned_program_days d ON d.id = v_day;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ape.id,
      'position', ape.position,
      'sets', ape.sets,
      'reps', CASE WHEN ape.reps ~ '^[0-9]+$' THEN ape.reps::integer ELSE NULL END,
      'weight_kg', ape.weight_kg,
      'rest_seconds', ape.rest_seconds,
      'duration_minutes', ape.duration_minutes,
      'notes', ape.notes,
      'set_details', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'set_number', aps.set_number,
          'reps', aps.reps,
          'weight_kg', aps.weight_kg,
          'rest_seconds', aps.rest_seconds
        ) ORDER BY aps.set_number)
        FROM public.assigned_program_exercise_sets aps
        WHERE aps.assigned_exercise_id = ape.id
      ), '[]'::jsonb),
      'exercise_id', e.id,
      'exercise', jsonb_build_object(
        'name', e.name,
        'name_en', e.name_en,
        'description', e.description,
        'instructions', e.instructions,
        'primary_muscle', e.primary_muscle,
        'equipment', e.equipment,
        'thumbnail_url', e.thumbnail_url,
        'video_url', e.video_url,
        'is_duration_based', e.is_duration_based
      )
    ) ORDER BY ape.position
  ), '[]'::jsonb)
  INTO v_exercises
  FROM public.assigned_program_exercises ape
  JOIN public.exercises e ON e.id = ape.exercise_id
  WHERE ape.deleted_at IS NULL
    AND (CASE WHEN v_racvan THEN ape.session_log_id = p_session_id
              ELSE v_day IS NOT NULL AND ape.day_id = v_day END);

  RETURN v_glava || jsonb_build_object('exercises', v_exercises);
END;
$$;

REVOKE ALL ON FUNCTION public.get_session_plan_full(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_session_plan_full(uuid) TO authenticated;
