-- Trener sme da potvrdi seriju umesto vezbaca.
--
-- Do sada je zeleno palio iskljucivo vezbac, a trener je mogao samo da ispravi
-- brojeve na vec zavrsenoj seriji (trainer_log_set radi samo UPDATE). U teretani
-- se desava da vezbac zaboravi da klikne, a trener stoji pored njega i vidi da
-- je serija odradjena - trebalo mu je da to potvrdi sam.
--
-- Posledica koju treba znati: pozicija vezbaca se racuna iz zavrsenih serija
-- (watch_compute_position), pa trenerova potvrda POMERA vezbaca na sledecu
-- seriju. To je i smisao radnje, ali zato:
--   - zivo stanje se ovde odmah pomera na novu poziciju (telefon i sat je citaju),
--   - pauza se NE pokrece: vezbac nista nije pritisnuo, pa mu se ne namece
--     odbrojavanje; ostaje 'active',
--   - trening se ne zavrsava trenerovom potvrdom, cak ni kad je spisak gotov -
--     kraj ostaje vezbacev (ili trenerov "zavrsi trening") potez.
--
-- Skidanje potvrde brise SAMO ono sto je trener sam obelezio (logged_by_trainer),
-- da trenerov tap ne moze da izbrise seriju koju je vezbac stvarno odradio.

CREATE OR REPLACE FUNCTION public.trainer_mark_set_done(
  p_session_id uuid,
  p_ape_id uuid,
  p_set_number integer DEFAULT NULL::integer,
  p_done boolean DEFAULT true
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_athlete uuid;
  v_ape uuid;
  v_pos jsonb;
  v_rows int;
BEGIN
  v_athlete := public._trainer_edit_guard(p_session_id);

  v_ape := public._session_plan_row(p_session_id, p_ape_id);
  IF v_ape IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u ovom treningu'; END IF;

  IF p_done THEN
    -- Upisuje se CILJ te serije (per-set red ako postoji, inace vezba), isto
    -- pravilo koje vazi kad vezbac zavrsi seriju bez unetih brojeva.
    INSERT INTO public.set_logs (
      session_log_id, exercise_id, set_number, reps, weight_kg,
      done, logged_by_trainer, started_at, completed_at)
    SELECT p_session_id, ape.id, n,
           COALESCE(
             NULLIF(substring(COALESCE(aps.reps, '') from '^[0-9]+'), '')::int,
             CASE WHEN ape.reps ~ '^[0-9]+$' THEN ape.reps::int END),
           COALESCE(aps.weight_kg, ape.weight_kg),
           true, true, now(), now()
    FROM public.assigned_program_exercises ape
    CROSS JOIN LATERAL generate_series(1, GREATEST(ape.sets, 1)) AS n
    LEFT JOIN public.assigned_program_exercise_sets aps
           ON aps.assigned_exercise_id = ape.id AND aps.set_number = n
    WHERE ape.id = v_ape
      AND (p_set_number IS NULL OR n = p_set_number)
    ON CONFLICT (session_log_id, exercise_id, set_number) DO NOTHING;
  ELSE
    DELETE FROM public.set_logs
    WHERE session_log_id = p_session_id
      AND exercise_id = v_ape
      AND (p_set_number IS NULL OR set_number = p_set_number)
      AND logged_by_trainer = true;
  END IF;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Pomeri zivo stanje na novu poziciju. Bez ovoga bi trener video zeleno, a
  -- vezbacev telefon i sat bi jos stajali na staroj seriji.
  v_pos := public.watch_compute_position(p_session_id);
  IF NOT (v_pos->>'complete')::boolean THEN
    UPDATE public.workout_live_state
    SET current_exercise_idx  = (v_pos->>'exercise_idx')::int,
        current_set_number    = (v_pos->>'set_number')::int,
        current_exercise_name = v_pos->>'exercise_name',
        total_sets            = (v_pos->>'total_sets')::int,
        current_state         = 'active',
        rest_ends_at          = NULL,
        last_heartbeat        = now()
    WHERE session_log_id = p_session_id AND athlete_id = v_athlete;
  END IF;

  RETURN jsonb_build_object('success', true, 'promenjeno', v_rows, 'position', v_pos);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.trainer_mark_set_done(uuid, uuid, integer, boolean) TO public, anon, authenticated, service_role;
