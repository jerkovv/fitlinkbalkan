CREATE OR REPLACE FUNCTION public.tg_live_state_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net', 'vault'
AS $function$
DECLARE
  v_key text;
  v_url text := 'https://iyvvskywmqtudafapxdk.supabase.co/functions/v1/send-la-push';
  v_struct_change boolean;
  v_hr_zone text;
  v_event text;
  v_content jsonb;
BEGIN
  -- GUARD protiv rekurzije: ako se promenila SAMO la_last_push_at (nas bump), izadji.
  IF NEW.la_last_push_at IS DISTINCT FROM OLD.la_last_push_at
     AND (to_jsonb(NEW) - 'la_last_push_at') = (to_jsonb(OLD) - 'la_last_push_at') THEN
    RETURN NEW;
  END IF;

  IF NEW.la_push_token IS NULL THEN
    RETURN NEW;
  END IF;

  v_struct_change := (
    NEW.current_set_number    IS DISTINCT FROM OLD.current_set_number    OR
    NEW.current_state         IS DISTINCT FROM OLD.current_state         OR
    NEW.current_exercise_idx  IS DISTINCT FROM OLD.current_exercise_idx  OR
    NEW.current_exercise_name IS DISTINCT FROM OLD.current_exercise_name OR
    NEW.rest_ends_at          IS DISTINCT FROM OLD.rest_ends_at
  );

  IF NOT v_struct_change
     AND NEW.la_last_push_at IS NOT NULL
     AND (now() - NEW.la_last_push_at) < interval '10 seconds' THEN
    RETURN NEW;
  END IF;

  v_hr_zone := CASE
    WHEN NEW.current_hr IS NULL OR NEW.current_hr <= 0 THEN 'rest'
    WHEN NEW.current_hr < 110 THEN 'easy'
    WHEN NEW.current_hr < 140 THEN 'moderate'
    WHEN NEW.current_hr < 165 THEN 'hard'
    ELSE 'max'
  END;

  v_content := jsonb_build_object(
    'exerciseName',    COALESCE(NEW.current_exercise_name, ''),
    'setNumber',       COALESCE(NEW.current_set_number, 1),
    'totalSets',       COALESCE(NEW.total_sets, 1),
    'hrZone',          v_hr_zone,
    'isResting',       (NEW.current_state = 'rest'),
    'isDurationBased', false,
    'watchConnected',  (NEW.watch_last_hr_at IS NOT NULL
                        AND NEW.watch_last_hr_at > now() - interval '30 seconds')
  );

  IF NEW.current_hr IS NOT NULL THEN
    v_content := v_content || jsonb_build_object('heartRate', NEW.current_hr);
  END IF;

  IF NEW.current_state = 'rest' AND NEW.rest_ends_at IS NOT NULL THEN
    v_content := v_content || jsonb_build_object(
      'restEndsAt', extract(epoch FROM NEW.rest_ends_at)::bigint
    );
  END IF;

  v_event := CASE WHEN NEW.current_state = 'completed' THEN 'end' ELSE 'update' END;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'token',        NEW.la_push_token,
      'event',        v_event,
      'staleSeconds', 120,
      'contentState', v_content
    ),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 5000
  );

  UPDATE public.workout_live_state
    SET la_last_push_at = now()
  WHERE session_log_id = NEW.session_log_id;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_live_state_push ON public.workout_live_state;
CREATE TRIGGER trg_live_state_push
AFTER UPDATE ON public.workout_live_state
FOR EACH ROW
EXECUTE FUNCTION public.tg_live_state_push();
