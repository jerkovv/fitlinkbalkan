-- Watch finish (kalorije/puls) + dnevni calories_active trigger.
-- Vec primenjeno u bazi (kreirano preko MCP); ova migracija unosi definicije
-- u version-control radi reproducibilnog setup-a. Bezbedno re-runnable
-- (CREATE OR REPLACE / DROP TRIGGER IF EXISTS).

-- Watch finish workout: prima kalorije/puls sa sata, upisuje instant u workout_session_logs
CREATE OR REPLACE FUNCTION public._engine_finish_workout(p_user_id uuid, p_session_id uuid, p_active_calories integer DEFAULT NULL::integer, p_hr_avg integer DEFAULT NULL::integer, p_hr_max integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM 1 FROM public.workout_session_logs
   WHERE id = p_session_id AND athlete_id = p_user_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_ended');
  END IF;

  PERFORM public._finalize_workout_session(p_session_id);

  IF p_active_calories IS NOT NULL OR p_hr_avg IS NOT NULL OR p_hr_max IS NOT NULL THEN
    UPDATE public.workout_session_logs
    SET active_calories = COALESCE(p_active_calories, active_calories),
        live_hr_avg = COALESCE(p_hr_avg, live_hr_avg),
        live_hr_max = COALESCE(p_hr_max, live_hr_max)
    WHERE id = p_session_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'state', 'completed');
END $function$;

CREATE OR REPLACE FUNCTION public.watch_finish_workout(p_token text, p_session_id uuid, p_active_calories integer DEFAULT NULL::integer, p_hr_avg integer DEFAULT NULL::integer, p_hr_max integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM public.watch_pairing_tokens
   WHERE token = p_token AND revoked_at IS NULL AND expires_at > now();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  RETURN public._engine_finish_workout(v_user_id, p_session_id, p_active_calories, p_hr_avg, p_hr_max);
END $function$;

-- Dnevni calories_active trigger: sabira kalorije sa sata po danu u wearable_data
CREATE OR REPLACE FUNCTION public.sync_daily_active_calories()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_day date;
  v_total numeric;
  v_provider text;
BEGIN
  v_user := COALESCE(NEW.user_id, OLD.user_id);
  v_day := COALESCE(NEW.started_at, OLD.started_at)::date;
  IF v_user IS NULL OR v_day IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT coalesce(sum(active_calories), 0), max(provider)
    INTO v_total, v_provider
  FROM public.wearable_workout_details
  WHERE user_id = v_user
    AND started_at::date = v_day
    AND active_calories IS NOT NULL;

  DELETE FROM public.wearable_data
  WHERE user_id = v_user AND data_type = 'calories_active' AND recorded_for = v_day;

  IF v_total > 0 THEN
    INSERT INTO public.wearable_data (user_id, provider, data_type, value, unit, recorded_for, recorded_at)
    VALUES (v_user, coalesce(v_provider, 'apple_health'), 'calories_active', round(v_total), 'kcal', v_day, now());
  END IF;

  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS trg_sync_daily_active_calories ON public.wearable_workout_details;
CREATE TRIGGER trg_sync_daily_active_calories
AFTER INSERT OR UPDATE OF active_calories OR DELETE ON public.wearable_workout_details
FOR EACH ROW EXECUTE FUNCTION public.sync_daily_active_calories();
