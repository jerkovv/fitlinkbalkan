CREATE OR REPLACE FUNCTION public.tg_session_log_trainer_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'vault'
AS $function$
DECLARE
  v_key text;
  v_url text := 'https://iyvvskywmqtudafapxdk.supabase.co/functions/v1/send-la-push';
  v_trainer_id uuid;
  v_tr_token text;
  v_tr_active boolean;
  v_relevant boolean;
  v_tr_content jsonb;
BEGIN
  -- Da li je ovo start/finish dogadjaj?
  IF TG_OP = 'INSERT' THEN
    v_relevant := (NEW.is_active IS TRUE);            -- vezbac upravo poceo
  ELSIF TG_OP = 'UPDATE' THEN
    v_relevant := (NEW.is_active IS DISTINCT FROM OLD.is_active); -- start ili finish
  ELSE
    v_relevant := false;
  END IF;

  IF NOT v_relevant THEN
    RETURN NEW;
  END IF;

  SELECT a.trainer_id INTO v_trainer_id
  FROM public.athletes a
  WHERE a.id = NEW.athlete_id;

  IF v_trainer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT push_token, active INTO v_tr_token, v_tr_active
  FROM public.trainer_live_activity
  WHERE trainer_id = v_trainer_id;

  IF v_tr_active IS NOT TRUE OR v_tr_token IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_key IS NULL THEN
    RETURN NEW;
  END IF;

  v_tr_content := public.trainer_live_content(v_trainer_id);

  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'token',        v_tr_token,
      'event',        'update',
      'staleSeconds', 120,
      'contentState', v_tr_content
    ),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 5000
  );

  UPDATE public.trainer_live_activity
    SET last_push_at = now()
  WHERE trainer_id = v_trainer_id;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;  -- nikad ne obori upis u session log
END;
$function$;

DROP TRIGGER IF EXISTS trg_session_log_trainer_push ON public.workout_session_logs;
CREATE TRIGGER trg_session_log_trainer_push
AFTER INSERT OR UPDATE OF is_active ON public.workout_session_logs
FOR EACH ROW
EXECUTE FUNCTION public.tg_session_log_trainer_push();
