-- Licni rekord se treneru javlja tek kad se trening zavrsi, ne posle svake serije.
CREATE OR REPLACE FUNCTION public.update_personal_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_athlete_id  uuid;
  v_exercise_id uuid;
  v_volume      numeric(8,2);
  v_e1rm        numeric(6,2);
  v_pr          public.personal_records%ROWTYPE;
  v_is_new_weight boolean := false;
  v_is_new_volume boolean := false;
  v_is_new_e1rm   boolean := false;
  v_prvi_put    boolean := false;
  v_trainer_id  uuid;
  v_athlete_name text;
  v_exercise_name text;
  v_vec_javljeno int;
BEGIN
  -- samo kad je set označen kao završen i ima validne brojeve
  IF NEW.done IS NOT TRUE THEN RETURN NEW; END IF;
  -- Trening koji je trener upisao naknadno ne pravi licne rekorde: brojeve nije
  -- izmerio uredjaj nego ih je neko ukucao, pa jedna omaska ostaje zauvek.
  IF EXISTS (SELECT 1 FROM public.workout_session_logs s
             WHERE s.id = NEW.session_log_id AND s.entered_by_trainer IS NOT NULL)
  THEN RETURN NEW; END IF;
  IF NEW.weight_kg IS NULL OR NEW.weight_kg <= 0 THEN RETURN NEW; END IF;
  IF NEW.reps IS NULL OR NEW.reps <= 0 THEN RETURN NEW; END IF;

  -- vlasnika seta i pravu vežbu (kroz snapshot u assigned_program_exercises)
  SELECT s.athlete_id, ape.exercise_id
    INTO v_athlete_id, v_exercise_id
  FROM public.workout_session_logs s
  JOIN public.assigned_program_exercises ape ON ape.id = NEW.exercise_id
  WHERE s.id = NEW.session_log_id;

  IF v_athlete_id IS NULL OR v_exercise_id IS NULL THEN RETURN NEW; END IF;

  v_volume := NEW.weight_kg * NEW.reps;
  v_e1rm   := ROUND((NEW.weight_kg * (1 + NEW.reps::numeric / 30))::numeric, 2);

  -- postojeći red (ako ga ima)
  SELECT * INTO v_pr
  FROM public.personal_records
  WHERE athlete_id = v_athlete_id AND exercise_id = v_exercise_id;

  IF NOT FOUND THEN
    -- prvi put — sve je PR
    INSERT INTO public.personal_records (
      athlete_id, exercise_id,
      best_weight_kg, best_weight_reps, best_weight_at, best_weight_session_log_id,
      best_volume_kg, best_volume_weight_kg, best_volume_reps, best_volume_at,
      best_e1rm_kg, best_e1rm_weight_kg, best_e1rm_reps, best_e1rm_at,
      updated_at
    ) VALUES (
      v_athlete_id, v_exercise_id,
      NEW.weight_kg, NEW.reps, now(), NEW.session_log_id,
      v_volume, NEW.weight_kg, NEW.reps, now(),
      v_e1rm, NEW.weight_kg, NEW.reps, now(),
      now()
    );
    v_is_new_weight := true;
    v_is_new_volume := true;
    v_is_new_e1rm   := true;
    v_prvi_put      := true;
  ELSE
    -- max weight (strogo veće, ili isti weight ali više reps)
    IF NEW.weight_kg > COALESCE(v_pr.best_weight_kg, 0)
       OR (NEW.weight_kg = v_pr.best_weight_kg AND NEW.reps > COALESCE(v_pr.best_weight_reps, 0)) THEN
      v_is_new_weight := true;
    END IF;

    IF v_volume > COALESCE(v_pr.best_volume_kg, 0) THEN
      v_is_new_volume := true;
    END IF;

    IF v_e1rm > COALESCE(v_pr.best_e1rm_kg, 0) THEN
      v_is_new_e1rm := true;
    END IF;

    IF v_is_new_weight OR v_is_new_volume OR v_is_new_e1rm THEN
      UPDATE public.personal_records SET
        best_weight_kg            = CASE WHEN v_is_new_weight THEN NEW.weight_kg ELSE best_weight_kg END,
        best_weight_reps          = CASE WHEN v_is_new_weight THEN NEW.reps ELSE best_weight_reps END,
        best_weight_at            = CASE WHEN v_is_new_weight THEN now() ELSE best_weight_at END,
        best_weight_session_log_id= CASE WHEN v_is_new_weight THEN NEW.session_log_id ELSE best_weight_session_log_id END,

        best_volume_kg            = CASE WHEN v_is_new_volume THEN v_volume ELSE best_volume_kg END,
        best_volume_weight_kg     = CASE WHEN v_is_new_volume THEN NEW.weight_kg ELSE best_volume_weight_kg END,
        best_volume_reps          = CASE WHEN v_is_new_volume THEN NEW.reps ELSE best_volume_reps END,
        best_volume_at            = CASE WHEN v_is_new_volume THEN now() ELSE best_volume_at END,

        best_e1rm_kg              = CASE WHEN v_is_new_e1rm THEN v_e1rm ELSE best_e1rm_kg END,
        best_e1rm_weight_kg       = CASE WHEN v_is_new_e1rm THEN NEW.weight_kg ELSE best_e1rm_weight_kg END,
        best_e1rm_reps            = CASE WHEN v_is_new_e1rm THEN NEW.reps ELSE best_e1rm_reps END,
        best_e1rm_at              = CASE WHEN v_is_new_e1rm THEN now() ELSE best_e1rm_at END,

        updated_at                = now()
      WHERE athlete_id = v_athlete_id AND exercise_id = v_exercise_id;
    END IF;
  END IF;

  -- Obavestenje treneru vise ne ide odavde: serija usred treninga moze da bude omaska
  -- (200 umesto 20 kg) koju vezbac odmah ispravi. Rekord se javlja tek kad se trening
  -- zavrsi, iz konacnih brojki (_javi_rekorde_posle_treninga).
  RETURN NEW;
END;
$function$
;


-- Rekordi se treneru javljaju jednom, kad se trening zavrsi, i to iz serija kakve su
-- ostale na kraju. Poredi se sa svim ranijim treninzima iste vezbe; vezba koja se radi
-- prvi put nema sta da obori. Najvise tri po treningu, kao i ranije.
CREATE OR REPLACE FUNCTION public._javi_rekorde_posle_treninga()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trainer_id uuid;
  v_athlete_name text;
  v_broj int := 0;
  r record;
BEGIN
  IF NEW.completed_at IS NULL OR OLD.completed_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.entered_by_trainer IS NOT NULL THEN RETURN NEW; END IF;

  BEGIN
    SELECT a.trainer_id, COALESCE(p.full_name, 'Vežbač')
      INTO v_trainer_id, v_athlete_name
    FROM public.athletes a
    LEFT JOIN public.profiles p ON p.id = a.id
    WHERE a.id = NEW.athlete_id;

    IF v_trainer_id IS NULL OR NOT public.should_notify_trainer(v_trainer_id, 'workouts') THEN
      RETURN NEW;
    END IF;

    FOR r IN
      WITH serije AS (
        SELECT ape.exercise_id AS vezba, sl.session_log_id AS sid, sl.weight_kg AS kg, sl.reps AS pon,
               round((sl.weight_kg * (1 + sl.reps::numeric / 30))::numeric, 2) AS e1rm
        FROM public.set_logs sl
        JOIN public.workout_session_logs s ON s.id = sl.session_log_id
        JOIN public.assigned_program_exercises ape ON ape.id = sl.exercise_id
        WHERE s.athlete_id = NEW.athlete_id
          AND s.entered_by_trainer IS NULL
          AND sl.done = true AND sl.weight_kg > 0 AND sl.reps > 0
          AND (s.id = NEW.id OR s.completed_at IS NOT NULL)
      ),
      danas AS (
        SELECT DISTINCT ON (vezba) vezba, kg, pon, (SELECT max(x.e1rm) FROM serije x WHERE x.sid = NEW.id AND x.vezba = serije.vezba) AS e1rm
        FROM serije WHERE sid = NEW.id
        ORDER BY vezba, kg DESC, pon DESC
      ),
      ranije AS (
        SELECT DISTINCT ON (vezba) vezba, kg, pon, (SELECT max(x.e1rm) FROM serije x WHERE x.sid <> NEW.id AND x.vezba = serije.vezba) AS e1rm
        FROM serije WHERE sid <> NEW.id
        ORDER BY vezba, kg DESC, pon DESC
      )
      SELECT d.vezba, d.kg, d.pon, d.e1rm, e.name AS ime,
             (d.kg > ra.kg OR (d.kg = ra.kg AND d.pon > ra.pon)) AS rekord_kg,
             (d.e1rm > ra.e1rm) AS rekord_e1rm
      FROM danas d
      JOIN ranije ra ON ra.vezba = d.vezba
      LEFT JOIN public.exercises e ON e.id = d.vezba
      WHERE d.kg > ra.kg OR (d.kg = ra.kg AND d.pon > ra.pon) OR d.e1rm > ra.e1rm
      ORDER BY (d.e1rm - ra.e1rm) DESC
      LIMIT 3
    LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.recipient_id = v_trainer_id AND n.kind = 'pr_set'
          AND n.meta ->> 'session_log_id' = NEW.id::text
          AND n.meta ->> 'exercise_id' = r.vezba::text);

      INSERT INTO public.notifications (
        recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta
      ) VALUES (
        v_trainer_id, 'trainer', NEW.athlete_id, NEW.athlete_id, 'pr_set',
        v_athlete_name || ' oborio rekord 🏆',
        COALESCE(r.ime, 'Vežba') || ' • ' ||
          trim(trailing '.' from trim(trailing '0' from r.kg::text)) || ' kg × ' || r.pon::text ||
          CASE WHEN r.rekord_e1rm
               THEN ' (1RM ~' || trim(trailing '.' from trim(trailing '0' from r.e1rm::text)) || ' kg)'
               ELSE '' END,
        jsonb_build_object(
          'exercise_id', r.vezba, 'exercise_name', r.ime,
          'weight_kg', r.kg, 'reps', r.pon, 'e1rm_kg', r.e1rm,
          'is_weight_pr', r.rekord_kg, 'is_volume_pr', false, 'is_e1rm_pr', r.rekord_e1rm,
          'session_log_id', NEW.id));
      v_broj := v_broj + 1;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- Obavestenje o rekordu ne sme da obori zavrsetak treninga.
    NULL;
  END;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._javi_rekorde_posle_treninga() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_rekordi_posle_treninga ON public.workout_session_logs;
CREATE TRIGGER trg_rekordi_posle_treninga
  AFTER UPDATE OF completed_at ON public.workout_session_logs
  FOR EACH ROW EXECUTE FUNCTION public._javi_rekorde_posle_treninga();
