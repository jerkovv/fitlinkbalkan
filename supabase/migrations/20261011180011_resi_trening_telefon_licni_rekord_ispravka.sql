-- Licni rekord je do sada umeo samo da raste (update_personal_record), pa je omaska
-- u kucanju (600 umesto 60 kg) ostajala rekord zauvek i posle ispravke serije i posle
-- prekida treninga. Ovde se rekord ponovo racuna iz serija koje su stvarno ostale, i to
-- samo kad je spustena ili obrisana bas serija koja je drzala rekord.
-- Vazi za sve puteve odjednom (athlete_update_set, trainer_update_set,
-- cancel_workout_session, brisanje serije), jer ide kroz okidac na set_logs.

CREATE OR REPLACE FUNCTION public._recompute_personal_record(
  p_athlete_id uuid,
  p_exercise_id uuid,
  p_weight boolean DEFAULT true,
  p_volume boolean DEFAULT true,
  p_e1rm boolean DEFAULT true
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_w record;
  v_v record;
  v_e record;
BEGIN
  -- Isti uslovi kao u update_personal_record: zavrsena serija sa kilazom i
  -- ponavljanjima, i ne iz treninga koji je trener naknadno ukucao.
  SELECT sl.weight_kg AS kg, sl.reps AS pon, sl.session_log_id AS sid,
         COALESCE(sl.completed_at, sl.created_at) AS kad
    INTO v_w
  FROM public.set_logs sl
  JOIN public.workout_session_logs s ON s.id = sl.session_log_id
  JOIN public.assigned_program_exercises ape ON ape.id = sl.exercise_id
  WHERE s.athlete_id = p_athlete_id AND ape.exercise_id = p_exercise_id
    AND sl.done = true AND sl.weight_kg > 0 AND sl.reps > 0
    AND s.entered_by_trainer IS NULL
  ORDER BY sl.weight_kg DESC, sl.reps DESC, COALESCE(sl.completed_at, sl.created_at) ASC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Nijedna serija te vezbe nije ostala: rekord nema na cemu da stoji.
    DELETE FROM public.personal_records
     WHERE athlete_id = p_athlete_id AND exercise_id = p_exercise_id;
    RETURN;
  END IF;

  SELECT sl.weight_kg AS kg, sl.reps AS pon,
         round((sl.weight_kg * sl.reps)::numeric, 2) AS vrednost,
         COALESCE(sl.completed_at, sl.created_at) AS kad
    INTO v_v
  FROM public.set_logs sl
  JOIN public.workout_session_logs s ON s.id = sl.session_log_id
  JOIN public.assigned_program_exercises ape ON ape.id = sl.exercise_id
  WHERE s.athlete_id = p_athlete_id AND ape.exercise_id = p_exercise_id
    AND sl.done = true AND sl.weight_kg > 0 AND sl.reps > 0
    AND s.entered_by_trainer IS NULL
  ORDER BY (sl.weight_kg * sl.reps) DESC, COALESCE(sl.completed_at, sl.created_at) ASC
  LIMIT 1;

  SELECT sl.weight_kg AS kg, sl.reps AS pon,
         round((sl.weight_kg * (1 + sl.reps::numeric / 30))::numeric, 2) AS vrednost,
         COALESCE(sl.completed_at, sl.created_at) AS kad
    INTO v_e
  FROM public.set_logs sl
  JOIN public.workout_session_logs s ON s.id = sl.session_log_id
  JOIN public.assigned_program_exercises ape ON ape.id = sl.exercise_id
  WHERE s.athlete_id = p_athlete_id AND ape.exercise_id = p_exercise_id
    AND sl.done = true AND sl.weight_kg > 0 AND sl.reps > 0
    AND s.entered_by_trainer IS NULL
  ORDER BY (sl.weight_kg * (1 + sl.reps::numeric / 30)) DESC, COALESCE(sl.completed_at, sl.created_at) ASC
  LIMIT 1;

  -- Menja se samo ona vrsta rekorda koju je drzala spustena serija; ostale ostaju.
  UPDATE public.personal_records SET
    best_weight_kg             = CASE WHEN p_weight THEN v_w.kg  ELSE best_weight_kg END,
    best_weight_reps           = CASE WHEN p_weight THEN v_w.pon ELSE best_weight_reps END,
    best_weight_at             = CASE WHEN p_weight THEN v_w.kad ELSE best_weight_at END,
    best_weight_session_log_id = CASE WHEN p_weight THEN v_w.sid ELSE best_weight_session_log_id END,

    best_volume_kg             = CASE WHEN p_volume THEN v_v.vrednost ELSE best_volume_kg END,
    best_volume_weight_kg      = CASE WHEN p_volume THEN v_v.kg  ELSE best_volume_weight_kg END,
    best_volume_reps           = CASE WHEN p_volume THEN v_v.pon ELSE best_volume_reps END,
    best_volume_at             = CASE WHEN p_volume THEN v_v.kad ELSE best_volume_at END,

    best_e1rm_kg               = CASE WHEN p_e1rm THEN v_e.vrednost ELSE best_e1rm_kg END,
    best_e1rm_weight_kg        = CASE WHEN p_e1rm THEN v_e.kg  ELSE best_e1rm_weight_kg END,
    best_e1rm_reps             = CASE WHEN p_e1rm THEN v_e.pon ELSE best_e1rm_reps END,
    best_e1rm_at               = CASE WHEN p_e1rm THEN v_e.kad ELSE best_e1rm_at END,

    updated_at                 = now()
  WHERE athlete_id = p_athlete_id AND exercise_id = p_exercise_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._recompute_personal_record(uuid, uuid, boolean, boolean, boolean)
  FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public._set_logs_pr_ispravka()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_athlete_id  uuid;
  v_exercise_id uuid;
  v_pr          public.personal_records%ROWTYPE;
  v_kg          boolean;
  v_vol         boolean;
  v_e1rm        boolean;
  v_novi        public.personal_records%ROWTYPE;
BEGIN
  -- Stara vrednost nije ni mogla da bude rekord.
  IF OLD.done IS NOT TRUE OR COALESCE(OLD.weight_kg, 0) <= 0 OR COALESCE(OLD.reps, 0) <= 0 THEN
    RETURN NULL;
  END IF;
  -- Serija je podignuta ili ista: to resava update_personal_record.
  IF TG_OP = 'UPDATE' AND NEW.done IS TRUE
     AND COALESCE(NEW.weight_kg, 0) >= OLD.weight_kg AND COALESCE(NEW.reps, 0) >= OLD.reps THEN
    RETURN NULL;
  END IF;

  -- Kad sesija nestaje zajedno sa nalogom (kaskada), nema ni vlasnika ni rekorda.
  SELECT s.athlete_id, ape.exercise_id
    INTO v_athlete_id, v_exercise_id
  FROM public.workout_session_logs s
  JOIN public.assigned_program_exercises ape ON ape.id = OLD.exercise_id
  WHERE s.id = OLD.session_log_id;
  IF v_athlete_id IS NULL OR v_exercise_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_pr FROM public.personal_records
   WHERE athlete_id = v_athlete_id AND exercise_id = v_exercise_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Racuna se ponovo samo ako je bas ova serija drzala rekord. Tako stari rekord,
  -- ciji izvor vise ne postoji u set_logs, ne moze slucajno da padne.
  v_kg   := COALESCE(OLD.weight_kg = v_pr.best_weight_kg AND OLD.reps = v_pr.best_weight_reps, false);
  v_vol  := COALESCE(round((OLD.weight_kg * OLD.reps)::numeric, 2) = v_pr.best_volume_kg, false);
  v_e1rm := COALESCE(round((OLD.weight_kg * (1 + OLD.reps::numeric / 30))::numeric, 2) = v_pr.best_e1rm_kg, false);
  IF NOT (v_kg OR v_vol OR v_e1rm) THEN RETURN NULL; END IF;

  PERFORM public._recompute_personal_record(v_athlete_id, v_exercise_id, v_kg, v_vol, v_e1rm);

  -- Treneru je vec otislo "oborio rekord" sa pogresnom brojkom. Ako rekord u kilazi
  -- vise ne pripada ovom treningu, obavestenje je netacno i sklanja se; ako i dalje
  -- pripada, dobija ispravljenu brojku. Ne sme da obori ispravku serije.
  BEGIN
    SELECT * INTO v_novi FROM public.personal_records
     WHERE athlete_id = v_athlete_id AND exercise_id = v_exercise_id;

    IF v_novi.id IS NULL OR v_novi.best_weight_session_log_id IS DISTINCT FROM OLD.session_log_id THEN
      DELETE FROM public.notifications n
       WHERE n.kind = 'pr_set'
         AND n.athlete_id = v_athlete_id
         AND n.meta ->> 'session_log_id' = OLD.session_log_id::text
         AND n.meta ->> 'exercise_id' = v_exercise_id::text;
    ELSE
      UPDATE public.notifications n
      SET body = COALESCE(n.meta ->> 'exercise_name', 'Vežba') || ' • ' ||
                 trim(trailing '.' from trim(trailing '0' from v_novi.best_weight_kg::text)) ||
                 ' kg × ' || v_novi.best_weight_reps::text,
          meta = n.meta || jsonb_build_object(
                   'weight_kg', v_novi.best_weight_kg,
                   'reps',      v_novi.best_weight_reps,
                   'e1rm_kg',   v_novi.best_e1rm_kg)
       WHERE n.kind = 'pr_set'
         AND n.athlete_id = v_athlete_id
         AND n.meta ->> 'session_log_id' = OLD.session_log_id::text
         AND n.meta ->> 'exercise_id' = v_exercise_id::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._set_logs_pr_ispravka() FROM PUBLIC, anon, authenticated;

-- Ime je po abecedi posle trg_set_logs_pr, pa na UPDATE ide tek kad stari okidac
-- zavrsi svoje podizanje.
CREATE OR REPLACE TRIGGER trg_set_logs_pr_ispravka
AFTER UPDATE OF done, weight_kg, reps OR DELETE ON public.set_logs
FOR EACH ROW EXECUTE FUNCTION public._set_logs_pr_ispravka();
