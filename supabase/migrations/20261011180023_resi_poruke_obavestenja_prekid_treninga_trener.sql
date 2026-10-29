-- Kad vezbac prekine trening (cancel_workout_session brise red sesije), treneru
-- nije isao nikakav paket za karticu na zakljucanom ekranu, pa je vezbac ostajao
-- "aktivan" dok se nesto drugo ne promeni. Ista funkcija okidaca sada pokriva i
-- brisanje aktivne sesije: posle brisanja trainer_live_content vec ne vidi taj
-- red, pa paket nosi tacno stanje. Sadrzaj paketa (trainer_live_content) se ne menja.
CREATE OR REPLACE FUNCTION public.tg_session_log_trainer_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'vault'
AS $function$
DECLARE
  v_key text;
  v_url text := 'https://iyvvskywmqtudafapxdk.supabase.co/functions/v1/send-la-push';
  v_athlete_id uuid;
  v_trainer_id uuid;
  v_tr_token text;
  v_tr_active boolean;
  v_tr_bundle text;
  v_relevant boolean;
  v_tr_content jsonb;
BEGIN
  -- Da li je ovo start/finish/prekid dogadjaj? NEW ne postoji kod brisanja,
  -- zato se grana po TG_OP pre bilo kog citanja reda.
  IF TG_OP = 'DELETE' THEN
    v_relevant := (OLD.is_active IS TRUE);            -- prekinut trening u toku
    v_athlete_id := OLD.athlete_id;
  ELSIF TG_OP = 'INSERT' THEN
    v_relevant := (NEW.is_active IS TRUE);            -- vezbac upravo poceo
    v_athlete_id := NEW.athlete_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_relevant := (NEW.is_active IS DISTINCT FROM OLD.is_active); -- start ili finish
    v_athlete_id := NEW.athlete_id;
  ELSE
    v_relevant := false;
  END IF;

  IF NOT v_relevant THEN
    RETURN NULL;  -- AFTER okidac: povratna vrednost se ne koristi
  END IF;

  SELECT a.trainer_id INTO v_trainer_id
  FROM public.athletes a
  WHERE a.id = v_athlete_id;

  IF v_trainer_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT push_token, active, bundle INTO v_tr_token, v_tr_active, v_tr_bundle
  FROM public.trainer_live_activity
  WHERE trainer_id = v_trainer_id;

  IF v_tr_active IS NOT TRUE OR v_tr_token IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_key IS NULL THEN
    RETURN NULL;
  END IF;

  v_tr_content := public.trainer_live_content(v_trainer_id);

  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'token',        v_tr_token,
      'bundle',       COALESCE(v_tr_bundle, 'rs.fitlink.app'),
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

  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN NULL;  -- nikad ne obori upis ili brisanje session loga
END;
$function$;

-- Samo aktivne sesije: brisanje naloga ili stare istorije ne salje nista.
DROP TRIGGER IF EXISTS trg_session_log_trainer_push_del ON public.workout_session_logs;
CREATE TRIGGER trg_session_log_trainer_push_del
  AFTER DELETE ON public.workout_session_logs
  FOR EACH ROW WHEN (OLD.is_active IS TRUE)
  EXECUTE FUNCTION public.tg_session_log_trainer_push();
