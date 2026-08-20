-- Tri trenerove izmene usred treninga sada rade nad vezbama TRENINGA, ne dana.
-- Svaka prvo racva plan (_fork_session_plan, lenjo i samo jednom), pa prevodi
-- id koji je stigao od klijenta u red ovog treninga (_session_ape).

-- A) Zamena vezbe - sada samo za DANAS.
CREATE OR REPLACE FUNCTION public.trainer_replace_exercise(
  p_session_id uuid, p_assigned_exercise_id uuid, p_new_exercise_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_athlete uuid; v_ime text; v_meta uuid;
BEGIN
  v_athlete := public._trainer_session_guard(p_session_id);

  SELECT e.name INTO v_ime FROM public.exercises e WHERE e.id = p_new_exercise_id;
  IF v_ime IS NULL THEN RAISE EXCEPTION 'Nepoznata vezba'; END IF;

  PERFORM public._fork_session_plan(p_session_id);
  v_meta := public._session_ape(p_session_id, p_assigned_exercise_id);
  IF v_meta IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u ovom treningu'; END IF;

  -- Ciljevi (serije/ponavljanja/kg) se NE diraju - trener ih vidi uz istoriju
  -- nove vezbe i podesi ih ako treba.
  UPDATE public.assigned_program_exercises
  SET exercise_id = p_new_exercise_id
  WHERE id = v_meta;

  -- Ako je zamenjena bas vezba koju vezbac trenutno radi, ime u zivom redu bi
  -- ostalo staro (vidi se na satu, u Live Activity i u listi aktivnih).
  -- current_exercise_idx je 0-bazirani indeks u nizu sortiranom po position,
  -- pa se poredi sa row_number, ne sa samom position (koja ne mora biti gusta).
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

  -- Signal telefonu: ponovo ucitaj plan.
  UPDATE public.workout_live_state
  SET plan_version = plan_version + 1
  WHERE session_log_id = p_session_id;

  RETURN jsonb_build_object('success', true, 'name', v_ime);
END;
$$;

-- B) Brisanje vise vezbi - sada samo za DANAS.
CREATE OR REPLACE FUNCTION public.trainer_remove_exercises(p_session_id uuid, p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_athlete uuid; v_meta uuid[]; v_sa_serijama int; v_ostalo int; v_obrisano int;
BEGIN
  v_athlete := public._trainer_session_guard(p_session_id);

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Nije izabrana nijedna vezba';
  END IF;

  PERFORM public._fork_session_plan(p_session_id);

  SELECT array_agg(public._session_ape(p_session_id, x.id)) INTO v_meta
  FROM unnest(p_ids) AS x(id);

  IF v_meta IS NULL OR array_position(v_meta, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Vezba nije u ovom treningu';
  END IF;

  -- Vezba sa vec upisanom serijom se NE brise: vezbac ju je odradio, a njeni
  -- setovi bi ostali u istoriji bez vezbe u planu (i volumen bi se razisao).
  SELECT count(*) INTO v_sa_serijama
  FROM public.set_logs sl
  WHERE sl.session_log_id = p_session_id AND sl.exercise_id = ANY(v_meta);
  IF v_sa_serijama > 0 THEN
    RAISE EXCEPTION 'Vezba koja vec ima upisanu seriju ne moze da se obrise';
  END IF;

  SELECT count(*) INTO v_ostalo
  FROM public.assigned_program_exercises ape
  WHERE ape.session_log_id = p_session_id AND ape.deleted_at IS NULL
    AND NOT (ape.id = ANY(v_meta));

  UPDATE public.assigned_program_exercises
  SET deleted_at = now()
  WHERE id = ANY(v_meta) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_obrisano = ROW_COUNT;

  RETURN public._trainer_resync_live(p_session_id, v_athlete)
         || jsonb_build_object('removed', v_obrisano, 'remaining', v_ostalo);
END;
$$;

-- C) Dodavanje vezbi - sada samo za DANAS.
CREATE OR REPLACE FUNCTION public.trainer_add_exercises(p_session_id uuid, p_exercise_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_athlete uuid; v_max int; v_dodato int;
BEGIN
  v_athlete := public._trainer_session_guard(p_session_id);

  IF p_exercise_ids IS NULL OR array_length(p_exercise_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Nije izabrana nijedna vezba';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_exercise_ids) AS x(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = x.id)
  ) THEN
    RAISE EXCEPTION 'Nepoznata vezba';
  END IF;

  PERFORM public._fork_session_plan(p_session_id);

  -- Max preko SVIH redova treninga, ukljucujuci obrisane - da nova vezba ne
  -- dobije poziciju koju vec drzi neki soft-obrisan red.
  SELECT COALESCE(max(ape.position), 0) INTO v_max
  FROM public.assigned_program_exercises ape WHERE ape.session_log_id = p_session_id;

  WITH nove AS (
    INSERT INTO public.assigned_program_exercises
      (session_log_id, exercise_id, position, sets, reps, rest_seconds)
    SELECT p_session_id, x.id, v_max + x.ord, 3, '10', 90
    FROM unnest(p_exercise_ids) WITH ORDINALITY AS x(id, ord)
    RETURNING id, exercise_id
  )
  INSERT INTO public.assigned_program_exercise_sets
    (assigned_exercise_id, set_number, reps, weight_kg, rest_seconds)
  SELECT n.id, s.sn, '10', NULL, 90
  FROM nove n
  JOIN public.exercises e ON e.id = n.exercise_id
  CROSS JOIN generate_series(1, 3) AS s(sn)
  -- Kardio (is_duration_based) ide na minute, nema per-set redove - kao u builderu.
  WHERE COALESCE(e.is_duration_based, false) = false;

  v_dodato := array_length(p_exercise_ids, 1);

  RETURN public._trainer_resync_live(p_session_id, v_athlete)
         || jsonb_build_object('added', v_dodato);
END;
$$;
