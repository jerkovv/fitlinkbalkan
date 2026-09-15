-- Vezbac ispravlja kilazu i ponavljanja na seriji koju je vec zavrsio.
--
-- Usred treninga vezbac je mogao samo napred: pogresno uneta kilaza na prethodnoj
-- vezbi ostajala je u istoriji i u "Prosli put". Ovo je samo ispravka broja - broj
-- upisanih serija i pozicija se ne menjaju (samo UPDATE, bez INSERT-a).
--
-- Pravilo "trenerov broj je konacan" ostaje: seriju koju je upisao ili ispravio
-- trener (logged_by_trainer) vezbac ne moze da pregazi; dobija error trainer_value.
--
-- Id vezbe: telefon moze drzati sablonski id (neracvan trening) ili vec sesijsku
-- kopiju (trener je menjao plan danas). _session_plan_row prevodi prvi u drugi, a
-- serije se traze pod oba, uvek unutar vezbaceve sesije.

CREATE OR REPLACE FUNCTION public.athlete_update_set(
  p_session_id uuid,
  p_ape_id uuid,
  p_set_number integer,
  p_reps integer,
  p_weight numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ape uuid;
  v_rows int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  PERFORM 1 FROM public.workout_session_logs
   WHERE id = p_session_id AND athlete_id = v_uid AND is_active = true;
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

  RETURN jsonb_build_object('success', true, 'set_number', p_set_number);
END;
$function$;

REVOKE ALL ON FUNCTION public.athlete_update_set(uuid, uuid, integer, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.athlete_update_set(uuid, uuid, integer, integer, numeric) TO authenticated;
