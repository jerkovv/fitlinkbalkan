-- Trener menja vezbu vezbacu KOJI UPRAVO TRENIRA (zauzeta sprava i slicno).
--
-- Kako izmena stigne na vezbacev telefon: njegov ekran ucita plan tacno jednom,
-- na pocetku treninga, i ne osvezava ga. Umesto da se otvara nova realtime
-- pretplata na assigned_program_exercises (ta tabela NIJE u supabase_realtime
-- objavi), koristi se red workout_live_state - koji JESTE u objavi i koji
-- vezbacev ekran vec slusa zbog pozicije i pulsa. Brojac plan_version se
-- podigne, vezbac to vidi kao obicnu promenu zivog reda i ponovo ucita dan.
-- Isti brojac ide i kroz athlete_poll_state (2s), pa se oporavlja i ako
-- realtime dogadjaj promasi.

ALTER TABLE public.workout_live_state
  ADD COLUMN IF NOT EXISTS plan_version integer NOT NULL DEFAULT 0;

-- Poll nosi plan_version, da promasen realtime dogadjaj ne ostavi vezbaca sa
-- starim planom do kraja treninga.
CREATE OR REPLACE FUNCTION public.athlete_poll_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid := auth.uid(); v_state jsonb;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;

  SELECT jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'server_now_ms', (extract(epoch FROM now())*1000)::bigint,
    'workout', jsonb_build_object(
      'session_id', wls.session_log_id,
      'current_exercise_name', wls.current_exercise_name,
      'current_exercise_idx', wls.current_exercise_idx,
      'current_set_number', wls.current_set_number,
      'total_sets', wls.total_sets,
      'current_state', wls.current_state,
      'current_hr', wls.current_hr,
      'watch_last_hr_at', wls.watch_last_hr_at,
      'last_heartbeat', wls.last_heartbeat,
      'plan_version', wls.plan_version,
      'started_at_ms', (extract(epoch FROM s.started_at)*1000)::bigint,
      'rest_ends_at_ms', (extract(epoch FROM wls.rest_ends_at)*1000)::bigint,
      'thumbnail_url', (SELECT e.thumbnail_url FROM public.exercises e WHERE e.name = wls.current_exercise_name LIMIT 1)
    )
  ) INTO v_state
  FROM public.workout_live_state wls
  JOIN public.workout_session_logs s ON s.id = wls.session_log_id
  WHERE wls.athlete_id = v_user_id
    AND wls.current_state IN ('active','rest')
    AND wls.last_heartbeat > now() - interval '5 minutes'
  ORDER BY wls.last_heartbeat DESC
  LIMIT 1;

  IF v_state IS NULL THEN
    v_state := jsonb_build_object('success', true, 'user_id', v_user_id,
      'server_now_ms', (extract(epoch FROM now())*1000)::bigint, 'workout', NULL);
  END IF;
  RETURN v_state;
END $function$;

CREATE OR REPLACE FUNCTION public.trainer_replace_exercise(
  p_session_id           uuid,
  p_assigned_exercise_id uuid,
  p_new_exercise_id      uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_athlete uuid;
  v_day     uuid;
  v_ime     text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni'; END IF;
  PERFORM public.require_active_trainer_sub();

  -- Sesija mora biti ZIVA. Menjanje plana zavrsenog treninga bi prepisivalo
  -- istoriju, a vezbac to vise ni ne bi video.
  SELECT s.athlete_id, s.day_id INTO v_athlete, v_day
  FROM public.workout_session_logs s
  WHERE s.id = p_session_id AND s.is_active = true;

  IF v_athlete IS NULL THEN RAISE EXCEPTION 'Trening nije aktivan'; END IF;
  IF NOT public.is_my_athlete(v_uid, v_athlete) THEN
    RAISE EXCEPTION 'Nije tvoj vezbac';
  END IF;
  -- Slobodan trening nema day_id ni vezbe (vidi _start_free_workout_session).
  IF v_day IS NULL THEN RAISE EXCEPTION 'Slobodan trening nema vezbe'; END IF;

  -- Vezba mora biti u BAS ovom danu. Bez ove provere bi se preko id-a mogla
  -- promeniti vezba u nekom sasvim drugom danu istog programa.
  IF NOT EXISTS (
    SELECT 1 FROM public.assigned_program_exercises ape
    WHERE ape.id = p_assigned_exercise_id
      AND ape.day_id = v_day
      AND ape.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Ta vezba nije u ovom treningu';
  END IF;

  SELECT e.name INTO v_ime FROM public.exercises e WHERE e.id = p_new_exercise_id;
  IF v_ime IS NULL THEN RAISE EXCEPTION 'Nepoznata vezba'; END IF;

  -- Ciljevi (serije/ponavljanja/kg) se NE diraju. Trener ih vidi na svom ekranu
  -- zajedno sa istorijom nove vezbe i podesi ih ako treba - tise je nego da
  -- funkcija sama obrise brojeve koje trener nije trazio da menja.
  UPDATE public.assigned_program_exercises
  SET exercise_id = p_new_exercise_id
  WHERE id = p_assigned_exercise_id;

  -- Ako je zamenjena bas vezba koju vezbac trenutno radi, ime u zivom redu bi
  -- ostalo staro (vidi se na satu, u Live Activity i u listi aktivnih).
  -- current_exercise_idx je 0-bazirani indeks u nizu sortiranom po position,
  -- pa se poredi sa row_number, ne sa samom position: na 4 od 102 dana pozicije
  -- imaju rupe (npr. 1,5,6,7,8 posle brisanja), gde bi position-1 pogodio pogresnu.
  WITH poredak AS (
    SELECT ape.id, (row_number() OVER (ORDER BY ape.position) - 1)::int AS idx
    FROM public.assigned_program_exercises ape
    WHERE ape.day_id = v_day AND ape.deleted_at IS NULL
  )
  UPDATE public.workout_live_state wls
  SET current_exercise_name = v_ime
  FROM poredak p
  WHERE wls.session_log_id = p_session_id
    AND p.id = p_assigned_exercise_id
    AND wls.current_exercise_idx = p.idx;

  -- Signal telefonu: ponovo ucitaj plan.
  UPDATE public.workout_live_state
  SET plan_version = plan_version + 1
  WHERE session_log_id = p_session_id;

  RETURN jsonb_build_object('success', true, 'name', v_ime);
END;
$$;

REVOKE ALL ON FUNCTION public.trainer_replace_exercise(uuid, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.trainer_replace_exercise(uuid, uuid, uuid) TO authenticated;
