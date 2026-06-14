-- PR notifikacija: dozvoli kind 'pr_set' u notifications_kind_check (inace INSERT
-- notifikacije pada na CHECK i, kroz triger update_personal_record, blokira upis
-- seta). Dodatno, INSERT PR notifikacije je u BEGIN/EXCEPTION da nikad ne sruci set.
-- Vec primenjeno na bazu preko MCP; ovaj fajl je samo za version control.

ALTER TABLE public.notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind = ANY (ARRAY['booking_created','booking_canceled','workout_completed','message','program_assigned','nutrition_assigned','message_from_trainer','membership_expiring','membership_expired','membership_activated','membership_rejected','payment_request','payment_marked','broadcast','generic','pr_set']));

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
  v_trainer_id  uuid;
  v_athlete_name text;
  v_exercise_name text;
BEGIN
  -- samo kad je set označen kao završen i ima validne brojeve
  IF NEW.done IS NOT TRUE THEN RETURN NEW; END IF;
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

  -- notifikacija treneru (samo ako je bilo ŠTA PR i grupa workouts ON)
  IF v_is_new_weight OR v_is_new_e1rm THEN
    SELECT a.trainer_id, COALESCE(p.full_name, 'Vežbač'), e.name
      INTO v_trainer_id, v_athlete_name, v_exercise_name
    FROM public.athletes a
    LEFT JOIN public.profiles p ON p.id = a.id
    LEFT JOIN public.exercises e ON e.id = v_exercise_id
    WHERE a.id = v_athlete_id;

    IF v_trainer_id IS NOT NULL
       AND public.should_notify_trainer(v_trainer_id, 'workouts') THEN
      -- PR notifikacija ne sme da blokira upis seta - ako padne, samo je preskoci
      BEGIN
        INSERT INTO public.notifications (
          recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta
        ) VALUES (
          v_trainer_id, 'trainer', v_athlete_id, v_athlete_id, 'pr_set',
          v_athlete_name || ' oborio rekord 🏆',
          COALESCE(v_exercise_name, 'Vežba') || ' • ' ||
            NEW.weight_kg::text || ' kg × ' || NEW.reps::text ||
            CASE WHEN v_is_new_e1rm THEN ' (1RM ~' || v_e1rm::text || ' kg)' ELSE '' END,
          jsonb_build_object(
            'exercise_id',   v_exercise_id,
            'exercise_name', v_exercise_name,
            'weight_kg',     NEW.weight_kg,
            'reps',          NEW.reps,
            'e1rm_kg',       v_e1rm,
            'is_weight_pr',  v_is_new_weight,
            'is_volume_pr',  v_is_new_volume,
            'is_e1rm_pr',    v_is_new_e1rm,
            'session_log_id', NEW.session_log_id
          )
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
