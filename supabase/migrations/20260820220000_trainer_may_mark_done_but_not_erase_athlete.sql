-- Trener sme da OZNACI seriju kao odradjenu, ali sme da SKINE samo svoju.
--
-- Prethodna migracija je zabranjivala oboje, pa trener nije mogao da vodi
-- trening kad vezbac ostavi telefon u torbi - a to je stvarna situacija u sali.
-- Sustina zabrane nije bila "trener ne sme da kaci" nego "trener ne sme da
-- obrise ono sto je vezbac zabelezio". Zato asimetrija:
--
--   * kacenje                   -> sme uvek (upis nosi logged_by_trainer = true)
--   * skidanje SVOJE oznake     -> sme (ispravka sopstvene greske)
--   * skidanje VEZBACEVE oznake -> nikad
--
-- Pozicija se posle kacenja mora poravnati, inace bi vezbacev sledeci klik
-- popunio POGRESNU seriju: pozicija je prva koja nedostaje, pa bi klik posle
-- trenerove serije 1 upisao seriju 2 iako je fizicki radjena tek druga.
-- _trainer_resync_live to radi, i NAMERNO ne dira current_state - vezbac se ne
-- baca u pauzu, sto je bilo prvo pravilo ovog niza izmena.
CREATE OR REPLACE FUNCTION public.trainer_mark_set_done(
  p_session_id uuid,
  p_ape_id     uuid,
  p_set_number integer,
  p_reps       integer DEFAULT NULL,
  p_weight     numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_athlete uuid; v_ape uuid; v_sets int; v_reps int; v_kg numeric;
BEGIN
  v_athlete := public._trainer_edit_guard(p_session_id);

  v_ape := public._session_plan_row(p_session_id, p_ape_id);
  IF v_ape IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u ovom treningu'; END IF;

  SELECT sets INTO v_sets FROM public.assigned_program_exercises WHERE id = v_ape;
  IF p_set_number < 1 OR p_set_number > v_sets THEN
    RAISE EXCEPTION 'Serija % ne postoji u ovoj vezbi (ima ih %)', p_set_number, v_sets;
  END IF;

  -- Bez prosledjenih brojeva uzmi CILJ te serije - trener ga je najcesce vec
  -- podesio, pa nema potrebe da isto kuca dvaput. Raspon ("6-10") nije broj,
  -- pa regex propusta samo cist ceo broj, a ostalo ostaje NULL.
  SELECT COALESCE(p_reps, CASE WHEN aps.reps ~ '^[0-9]+$' THEN aps.reps::int END),
         COALESCE(p_weight, aps.weight_kg)
    INTO v_reps, v_kg
  FROM public.assigned_program_exercise_sets aps
  WHERE aps.assigned_exercise_id = v_ape AND aps.set_number = p_set_number;

  v_reps := COALESCE(v_reps, p_reps);
  v_kg   := COALESCE(v_kg, p_weight);

  -- DO NOTHING: ako je vezbac u medjuvremenu sam zavrsio bas tu seriju, njegov
  -- zapis ostaje netaknut - trener ga ne pregazi ovim putem.
  INSERT INTO public.set_logs (
    session_log_id, exercise_id, set_number, reps, weight_kg,
    done, started_at, completed_at, logged_by_trainer
  )
  VALUES (p_session_id, v_ape, p_set_number, v_reps, v_kg,
          true, now(), now(), true)
  ON CONFLICT (session_log_id, exercise_id, set_number) DO NOTHING;

  RETURN public._trainer_resync_live(p_session_id, v_athlete)
         || jsonb_build_object('set_number', p_set_number);
END;
$$;

-- Skidanje oznake: samo ono sto je trener sam stavio.
CREATE OR REPLACE FUNCTION public.trainer_unmark_set(
  p_session_id uuid, p_ape_id uuid, p_set_number integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_athlete uuid; v_ape uuid; v_ciji boolean; v_rows int;
BEGIN
  v_athlete := public._trainer_edit_guard(p_session_id);

  v_ape := public._session_plan_row(p_session_id, p_ape_id);
  IF v_ape IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u ovom treningu'; END IF;

  SELECT logged_by_trainer INTO v_ciji FROM public.set_logs
  WHERE session_log_id = p_session_id AND exercise_id = v_ape AND set_number = p_set_number;

  IF v_ciji IS NULL THEN RAISE EXCEPTION 'Ta serija nije upisana'; END IF;
  IF NOT v_ciji THEN
    RAISE EXCEPTION 'Seriju koju je vezbac zavrsio ne mozes da skines';
  END IF;

  DELETE FROM public.set_logs
  WHERE session_log_id = p_session_id AND exercise_id = v_ape AND set_number = p_set_number;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN public._trainer_resync_live(p_session_id, v_athlete)
         || jsonb_build_object('removed', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.trainer_mark_set_done(uuid, uuid, integer, integer, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trainer_mark_set_done(uuid, uuid, integer, integer, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.trainer_unmark_set(uuid, uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trainer_unmark_set(uuid, uuid, integer) TO authenticated;
