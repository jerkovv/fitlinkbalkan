-- 1) Trener potvrdi poslednje serije ili obrise preostale vezbe: trening po planu se
--    mora zatvoriti (isto sto motor radi kad vezbac sam zavrsi poslednju seriju).
--    Ranije je sesija ostajala aktivna, a vezbacev telefon na seriji koja je vec upisana.
-- 2) Trenerova ispravka vezbaceve serije (trainer_log_set) dize logged_by_trainer, jer je
--    trenerov broj konacan i vezbac ga vise ne menja (athlete_update_set). Isti znak je
--    sluzio i za "skini potvrdu", pa je ispravljena vezbaceva serija mogla da se obrise.
--    Zato se posebno pamti KO JE NAPRAVIO red: skida se samo ono sto je trener sam potvrdio.

ALTER TABLE public.set_logs
  ADD COLUMN IF NOT EXISTS created_by_trainer boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.set_logs.created_by_trainer IS
  'Red je napravio trener potvrdom (trainer_mark_set_done). logged_by_trainer znaci samo da je broj trenerov.';

CREATE OR REPLACE FUNCTION public.trainer_mark_set_done(p_session_id uuid, p_ape_id uuid, p_set_number integer DEFAULT NULL::integer, p_done boolean DEFAULT true)
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
  v_aktivan boolean;
  v_day uuid;
  v_stanje text := NULL;
BEGIN
  v_athlete := public._trainer_edit_guard(p_session_id);

  v_ape := public._session_plan_row(p_session_id, p_ape_id);
  IF v_ape IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u ovom treningu'; END IF;

  IF p_done THEN
    INSERT INTO public.set_logs (
      session_log_id, exercise_id, set_number, reps, weight_kg,
      done, logged_by_trainer, created_by_trainer, started_at, completed_at)
    SELECT p_session_id, ape.id, n,
           COALESCE(
             NULLIF(substring(COALESCE(aps.reps, '') from '^[0-9]+'), '')::int,
             CASE WHEN ape.reps ~ '^[0-9]+$' THEN ape.reps::int END),
           COALESCE(aps.weight_kg, ape.weight_kg),
           true, true, true, now(), now()
    FROM public.assigned_program_exercises ape
    CROSS JOIN LATERAL generate_series(1, GREATEST(ape.sets, 1)) AS n
    LEFT JOIN public.assigned_program_exercise_sets aps
           ON aps.assigned_exercise_id = ape.id AND aps.set_number = n
    WHERE ape.id = v_ape
      AND (p_set_number IS NULL OR n = p_set_number)
    ON CONFLICT (session_log_id, exercise_id, set_number) DO NOTHING;
  ELSE
    -- Samo redovi koje je trener sam napravio. Vezbaceva serija koju je trener
    -- ispravio nosi logged_by_trainer, ali nije trenerova potvrda i ne brise se.
    DELETE FROM public.set_logs
    WHERE session_log_id = p_session_id
      AND exercise_id = v_ape
      AND (p_set_number IS NULL OR set_number = p_set_number)
      AND created_by_trainer = true;
  END IF;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  SELECT s.is_active, s.day_id INTO v_aktivan, v_day
  FROM public.workout_session_logs s WHERE s.id = p_session_id;

  v_pos := public.watch_compute_position(p_session_id);

  -- Zivo stanje se dira samo dok trening traje: zavrsen trening se ne budi i
  -- ne zatvara drugi put (kraj i trajanje bi se prepisali).
  IF COALESCE(v_aktivan, false) THEN
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
    ELSIF v_day IS NULL THEN
      -- Slobodan trening: gotov spisak nije gotov trening (isto kao u motoru).
      UPDATE public.workout_live_state
      SET current_state = 'active',
          rest_ends_at = NULL,
          current_exercise_name = NULL,
          current_exercise_idx = NULL,
          current_set_number = NULL,
          total_sets = 0,
          plan_version = plan_version + 1,
          last_heartbeat = now()
      WHERE session_log_id = p_session_id AND athlete_id = v_athlete;
      v_stanje := 'free_plan_done';
    ELSE
      -- Trening po planu: poslednja serija je potvrdjena, trening je gotov.
      PERFORM public._finalize_workout_session(p_session_id);
      v_stanje := 'completed';
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'promenjeno', v_rows, 'position', v_pos)
         || CASE WHEN v_stanje IS NULL THEN '{}'::jsonb
                 ELSE jsonb_build_object('state', v_stanje) END;
END;
$function$;

CREATE OR REPLACE FUNCTION public._trainer_resync_live(p_session_id uuid, p_athlete uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_next jsonb; v_aktivan boolean; v_day uuid;
BEGIN
  v_next := public.watch_compute_position(p_session_id);

  IF (v_next->>'complete')::boolean THEN
    SELECT s.is_active, s.day_id INTO v_aktivan, v_day
    FROM public.workout_session_logs s WHERE s.id = p_session_id;

    -- Slobodan trening: spisak je gotov, trening traje. Polja tekuce vezbe se
    -- MORAJU ocistiti, inace telefon i sat ostaju na vezbi koje vise nema.
    -- Isto sto radi i motor kad vezbac sam dodje do kraja spiska.
    IF v_day IS NULL THEN
      UPDATE public.workout_live_state
      SET current_state = 'active',
          rest_ends_at = NULL,
          current_exercise_name = NULL,
          current_exercise_idx = NULL,
          current_set_number = NULL,
          total_sets = 0,
          plan_version = plan_version + 1
      WHERE session_log_id = p_session_id AND athlete_id = p_athlete;
      RETURN jsonb_build_object('success', true, 'state', 'free_plan_done');
    END IF;

    -- Trening po planu u kome posle izmene nema vise nijedne neuradjene serije
    -- (trener je obrisao preostale vezbe ili serije): trening je gotov. Bez ovoga
    -- vezbac ostaje na vezbi koje vise nema i njegova dugmad ne rade nista.
    -- Vec zavrsen trening se ne zatvara drugi put.
    IF COALESCE(v_aktivan, false) THEN
      PERFORM public._finalize_workout_session(p_session_id);
      UPDATE public.workout_live_state
      SET plan_version = plan_version + 1
      WHERE session_log_id = p_session_id AND athlete_id = p_athlete;
      RETURN jsonb_build_object('success', true, 'state', 'completed');
    END IF;

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
$function$;
