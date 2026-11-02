-- Live Activity: paket za zakljucan ekran nosi i cilj serije ("65 kg × 10"),
-- tip serije i pocetak pauze. Dok je telefon zakljucan karticu puni samo
-- server, pa bez ovoga ta polja nestanu cim aplikacija zaspi.

CREATE OR REPLACE FUNCTION public._la_cilj_serije(
  p_session_id uuid, p_idx integer, p_set integer, p_rest_ends timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_day uuid;
  v_racvan boolean := false;
  v_ape_id uuid; v_ape_reps text; v_ape_kg numeric; v_ape_rest integer;
  v_trajanje integer; v_na_vreme boolean;
  v_reps text; v_kg numeric; v_tip text; v_rest integer;
  v_kg_txt text;
  v_out jsonb := '{}'::jsonb;
BEGIN
  IF p_session_id IS NULL OR p_idx IS NULL OR p_idx < 0 THEN RETURN v_out; END IF;

  SELECT s.day_id INTO v_day FROM public.workout_session_logs s WHERE s.id = p_session_id;
  SELECT EXISTS (SELECT 1 FROM public.assigned_program_exercises
                 WHERE session_log_id = p_session_id) INTO v_racvan;

  -- Isti spisak i isti redosled kao get_session_plan_full: indeks vezbe u
  -- workout_live_state broji po njemu.
  SELECT ape.id, ape.reps::text, ape.weight_kg, ape.rest_seconds, ape.duration_minutes,
         COALESCE(e.is_duration_based, false)
    INTO v_ape_id, v_ape_reps, v_ape_kg, v_ape_rest, v_trajanje, v_na_vreme
  FROM public.assigned_program_exercises ape
  JOIN public.exercises e ON e.id = ape.exercise_id
  WHERE ape.deleted_at IS NULL
    AND (CASE WHEN v_racvan THEN ape.session_log_id = p_session_id
              ELSE v_day IS NOT NULL AND ape.day_id = v_day END)
  ORDER BY ape.position
  OFFSET p_idx LIMIT 1;
  IF v_ape_id IS NULL THEN RETURN v_out; END IF;

  SELECT NULLIF(btrim(aps.reps::text), ''), aps.weight_kg, aps.set_type, aps.rest_seconds
    INTO v_reps, v_kg, v_tip, v_rest
  FROM public.assigned_program_exercise_sets aps
  WHERE aps.assigned_exercise_id = v_ape_id AND aps.set_number = COALESCE(p_set, 1);
  IF NOT FOUND THEN
    v_reps := NULLIF(btrim(v_ape_reps), '');
    v_kg := v_ape_kg;
  END IF;
  v_rest := COALESCE(v_rest, v_ape_rest);

  IF v_na_vreme THEN
    v_out := jsonb_build_object('isDurationBased', true);
    IF v_trajanje IS NOT NULL THEN
      v_out := v_out || jsonb_build_object('durationMinutes', v_trajanje);
    END IF;
  ELSE
    IF v_kg IS NOT NULL AND v_kg > 0 THEN
      v_kg_txt := CASE WHEN v_kg = round(v_kg) THEN round(v_kg)::bigint::text
                       ELSE round(v_kg, 1)::text END;
      v_out := jsonb_build_object('weightText', v_kg_txt || ' kg × ' || COALESCE(v_reps, '-'));
    ELSIF v_reps IS NOT NULL THEN
      v_out := jsonb_build_object('weightText', v_reps || ' ponavljanja');
    END IF;
    IF v_tip IS NOT NULL AND v_tip <> '' THEN
      v_out := v_out || jsonb_build_object('tipSerije', v_tip);
    END IF;
  END IF;

  -- Pocetak pauze = kraj minus planirana pauza; traka na kartici onda pokazuje
  -- koliko je pauze ostalo, a ne krece od pune na svako osvezavanje.
  IF p_rest_ends IS NOT NULL AND v_rest IS NOT NULL AND v_rest > 0 THEN
    v_out := v_out || jsonb_build_object(
      'restStartedAt', (extract(epoch FROM p_rest_ends)::bigint - v_rest - 978307200));
  END IF;

  RETURN v_out;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._la_cilj_serije(uuid, integer, integer, timestamptz) FROM PUBLIC, anon, authenticated;
