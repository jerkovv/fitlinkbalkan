-- Trener usred treninga brise vise vezbi odjednom i dodaje nove.
--
-- Za razliku od zamene, ovo MENJA BROJ vezbi. Pozicija vezbaca je indeks u nizu,
-- pa se posle svake izmene mora ponovo izracunati na serveru i poslati zajedno
-- sa planom. watch_compute_position to vec radi ispravno (trazi prvu vezbu po
-- redosledu kojoj done_count < sets), pa je server izvor istine, a klijent samo
-- primi novi indeks u istom realtime dogadjaju kao i novi plan_version.

CREATE OR REPLACE FUNCTION public._trainer_resync_live(p_session_id uuid, p_athlete uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_next jsonb;
BEGIN
  v_next := public.watch_compute_position(p_session_id);

  -- Sve preostalo je odradjeno (npr. obrisane bas one vezbe koje su ostajale)
  -- -> trening je gotov, isto kao da je vezbac zavrsio poslednju seriju.
  IF (v_next->>'complete')::boolean THEN
    PERFORM public._finalize_workout_session(p_session_id);
    RETURN jsonb_build_object('success', true, 'state', 'completed');
  END IF;

  -- current_state se NAMERNO ne dira: izmena plana ne sme da izbaci vezbaca iz
  -- pauze niti da ga u nju gurne. Menja se samo gde je u planu, plus signal.
  UPDATE public.workout_live_state
  SET current_exercise_idx = (v_next->>'exercise_idx')::int,
      current_set_number   = (v_next->>'set_number')::int,
      current_exercise_name= v_next->>'exercise_name',
      total_sets           = (v_next->>'total_sets')::int,
      plan_version         = plan_version + 1,
      last_heartbeat       = now()
  WHERE session_log_id = p_session_id AND athlete_id = p_athlete;

  RETURN jsonb_build_object('success', true, 'position', v_next);
END;
$$;

-- Brisanje vise vezbi odjednom (soft delete - deleted_at).
--
-- Hard delete nije opcija: set_logs.exercise_id pokazuje bas na ove redove, pa bi
-- brisanje oborilo strani kljuc ili odseklo istoriju. Ceo app ionako vec radi sa
-- deleted_at (get_workout_day_full i watch_compute_position filtriraju po njemu).
CREATE OR REPLACE FUNCTION public.trainer_remove_exercises(
  p_session_id uuid,
  p_ids        uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_athlete uuid; v_day uuid; v_sa_serijama int; v_ostalo int; v_obrisano int;
BEGIN
  v_athlete := public._trainer_session_guard(p_session_id);
  SELECT s.day_id INTO v_day FROM public.workout_session_logs s WHERE s.id = p_session_id;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Nije izabrana nijedna vezba';
  END IF;

  -- Vezba sa vec upisanom serijom se NE brise: vezbac ju je odradio, a njeni
  -- setovi bi ostali u istoriji bez vezbe u planu (i volumen bi se razisao).
  SELECT count(*) INTO v_sa_serijama
  FROM public.set_logs sl
  WHERE sl.session_log_id = p_session_id AND sl.exercise_id = ANY(p_ids);
  IF v_sa_serijama > 0 THEN
    RAISE EXCEPTION 'Vezba koja vec ima upisanu seriju ne moze da se obrise';
  END IF;

  -- Sve vezbe moraju biti iz BAS ovog dana.
  IF EXISTS (
    SELECT 1 FROM unnest(p_ids) AS x(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assigned_program_exercises ape
      WHERE ape.id = x.id AND ape.day_id = v_day AND ape.deleted_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Vezba nije u ovom treningu';
  END IF;

  SELECT count(*) INTO v_ostalo
  FROM public.assigned_program_exercises ape
  WHERE ape.day_id = v_day AND ape.deleted_at IS NULL AND NOT (ape.id = ANY(p_ids));

  UPDATE public.assigned_program_exercises
  SET deleted_at = now()
  WHERE id = ANY(p_ids) AND day_id = v_day AND deleted_at IS NULL;
  GET DIAGNOSTICS v_obrisano = ROW_COUNT;

  RETURN public._trainer_resync_live(p_session_id, v_athlete)
         || jsonb_build_object('removed', v_obrisano, 'remaining', v_ostalo);
END;
$$;

-- Dodavanje novih vezbi na kraj treninga, sa istim podrazumevanim vrednostima
-- koje koristi i builder (3 serije, 10 ponavljanja, 90s pauze).
CREATE OR REPLACE FUNCTION public.trainer_add_exercises(
  p_session_id  uuid,
  p_exercise_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_athlete uuid; v_day uuid; v_max int; v_dodato int;
BEGIN
  v_athlete := public._trainer_session_guard(p_session_id);
  SELECT s.day_id INTO v_day FROM public.workout_session_logs s WHERE s.id = p_session_id;

  IF p_exercise_ids IS NULL OR array_length(p_exercise_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Nije izabrana nijedna vezba';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_exercise_ids) AS x(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = x.id)
  ) THEN
    RAISE EXCEPTION 'Nepoznata vezba';
  END IF;

  -- Max preko SVIH redova dana, ukljucujuci obrisane - da nova vezba ne dobije
  -- poziciju koju vec drzi neki soft-obrisan red.
  SELECT COALESCE(max(ape.position), 0) INTO v_max
  FROM public.assigned_program_exercises ape WHERE ape.day_id = v_day;

  WITH nove AS (
    INSERT INTO public.assigned_program_exercises
      (day_id, exercise_id, position, sets, reps, rest_seconds)
    SELECT v_day, x.id, v_max + x.ord, 3, '10', 90
    FROM unnest(p_exercise_ids) WITH ORDINALITY AS x(id, ord)
    RETURNING id, exercise_id
  )
  INSERT INTO public.assigned_program_exercise_sets
    (assigned_exercise_id, set_number, reps, weight_kg, rest_seconds)
  SELECT n.id, s.sn, '10', NULL, 90
  FROM nove n
  JOIN public.exercises e ON e.id = n.exercise_id
  CROSS JOIN generate_series(1, 3) AS s(sn)
  -- Kardio (is_duration_based) ide na minute, nema per-set redove - isto kao u builderu.
  WHERE COALESCE(e.is_duration_based, false) = false;

  v_dodato := array_length(p_exercise_ids, 1);

  RETURN public._trainer_resync_live(p_session_id, v_athlete)
         || jsonb_build_object('added', v_dodato);
END;
$$;

REVOKE ALL ON FUNCTION public._trainer_resync_live(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._trainer_resync_live(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.trainer_remove_exercises(uuid, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trainer_remove_exercises(uuid, uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.trainer_add_exercises(uuid, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trainer_add_exercises(uuid, uuid[]) TO authenticated;
