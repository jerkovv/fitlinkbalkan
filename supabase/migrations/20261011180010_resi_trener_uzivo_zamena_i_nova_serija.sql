-- 1) Zamena vezbe koja vec ima upisanu seriju prepisivala je uradjeno na novu vezbu
--    (u danasnjem treningu i u istoriji). Sad se odbija, kao brisanje i superset.
-- 2) "+ Serija" (p_weight NULL) pravila je seriju bez ciljne kilaze, pa je vezbac
--    dobijao 0 kg. Nova serija sad nosi cilj poslednje postojece serije.

CREATE OR REPLACE FUNCTION public.trainer_replace_exercise(p_session_id uuid, p_assigned_exercise_id uuid, p_new_exercise_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_athlete uuid; v_ime text; v_meta uuid;
BEGIN
  v_athlete := public._trainer_session_guard(p_session_id);

  SELECT e.name INTO v_ime FROM public.exercises e WHERE e.id = p_new_exercise_id;
  IF v_ime IS NULL THEN RAISE EXCEPTION 'Nepoznata vezba'; END IF;

  PERFORM public._fork_session_plan(p_session_id);
  v_meta := public._session_ape(p_session_id, p_assigned_exercise_id);
  IF v_meta IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u ovom treningu'; END IF;

  -- Upisane serije pripadaju vezbi koja je radjena. Zamena bi ih prepisala na
  -- novu vezbu: nestale bi iz istorije stare i postale "prosli put" nove.
  -- (Greska ponistava i racvanje iznad.) Tekst je sa kvacicama da ga aplikacija prikaze.
  IF EXISTS (SELECT 1 FROM public.set_logs sl
             WHERE sl.session_log_id = p_session_id AND sl.exercise_id = v_meta) THEN
    RAISE EXCEPTION 'Vežba koja već ima upisanu seriju ne može da se zameni';
  END IF;

  -- Ciljevi (serije/ponavljanja/kg) se NE diraju - trener ih vidi uz istoriju
  -- nove vezbe i podesi ih ako treba.
  UPDATE public.assigned_program_exercises
  SET exercise_id = p_new_exercise_id
  WHERE id = v_meta;

  -- Ako je zamenjena bas vezba koju vezbac trenutno radi, ime u zivom redu bi
  -- ostalo staro (vidi se na satu, u Live Activity i u listi aktivnih).
  WITH poredak AS (
    SELECT ape.id, (row_number() OVER (ORDER BY ape.position) - 1)::int AS idx
    FROM public.assigned_program_exercises ape
    WHERE ape.session_log_id = p_session_id AND ape.deleted_at IS NULL
  )
  UPDATE public.workout_live_state wls
  SET current_exercise_name = v_ime
  FROM poredak p
  WHERE wls.session_log_id = p_session_id
    AND p.id = v_meta
    AND wls.current_exercise_idx = p.idx;

  UPDATE public.workout_live_state
  SET plan_version = plan_version + 1
  WHERE session_log_id = p_session_id;

  RETURN jsonb_build_object('success', true, 'name', v_ime);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trainer_set_exercise_target(p_session_id uuid, p_ape_id uuid, p_sets integer DEFAULT NULL::integer, p_reps integer DEFAULT NULL::integer, p_weight numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_athlete uuid; v_ape uuid;
  v_stare int; v_trazeno int; v_stvarno int; v_max_log int;
  v_reps text; v_rest int; v_kg numeric;
  v_ima_zadnju boolean := false;
  v_z_reps text; v_z_kg numeric; v_z_rest int;
BEGIN
  v_athlete := public._trainer_edit_guard(p_session_id);

  -- Izmena cilja je izmena PLANA, pa vazi samo za danas -> racvaj.
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
  SELECT sets, reps, rest_seconds, weight_kg INTO v_stvarno, v_reps, v_rest, v_kg
  FROM public.assigned_program_exercises WHERE id = v_ape;

  -- Per-set ciljevi su izvor istine za vezbacev ekran, pa se poravnaju sa njim.
  DELETE FROM public.assigned_program_exercise_sets
  WHERE assigned_exercise_id = v_ape AND set_number > v_stvarno;

  -- Nova serija nosi cilj poslednje postojece (kilaza, ponavljanja, pauza). Ranije
  -- je dobijala p_weight, koji "+ Serija" salje kao NULL, pa je vezbac video 0 kg.
  -- Kad per-set redova nema, rezerva je cilj same vezbe.
  SELECT aps.reps, aps.weight_kg, aps.rest_seconds INTO v_z_reps, v_z_kg, v_z_rest
  FROM public.assigned_program_exercise_sets aps
  WHERE aps.assigned_exercise_id = v_ape
  ORDER BY aps.set_number DESC
  LIMIT 1;
  v_ima_zadnju := FOUND;

  INSERT INTO public.assigned_program_exercise_sets
    (assigned_exercise_id, set_number, reps, weight_kg, rest_seconds)
  SELECT v_ape, n,
         CASE WHEN v_ima_zadnju THEN COALESCE(v_z_reps, v_reps) ELSE v_reps END,
         COALESCE(p_weight, CASE WHEN v_ima_zadnju THEN v_z_kg ELSE v_kg END),
         CASE WHEN v_ima_zadnju THEN COALESCE(v_z_rest, v_rest) ELSE v_rest END
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
$function$;
