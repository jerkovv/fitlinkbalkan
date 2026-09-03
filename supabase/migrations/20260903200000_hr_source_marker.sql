-- Puls sa BLE trake (telefon) treneru uzivo.
--
-- Do sada je trenerski prikaz gledao watch_last_hr_at, koji pise ISKLJUCIVO sat.
-- Vezbac sa trakom je slao puls u current_hr (athlete_heartbeat), ali je trener
-- video precrtan sat i prazno mesto. Resenje NIJE pustiti telefon u
-- watch_last_hr_at: ta kolona znaci "sat je tu" i vozi jos i status konekcije
-- (WATCH_GRACE_MS), pa bi indikator sata lagao.
--
-- Umesto toga se uvodi opsti otisak: hr_last_at ("puls stize") + hr_source
-- ("odakle"). Sat i dalje pise i svoju kolonu, pa watch logika ostaje netaknuta.

ALTER TABLE public.workout_live_state
  ADD COLUMN IF NOT EXISTS hr_last_at timestamptz,
  ADD COLUMN IF NOT EXISTS hr_source text;

ALTER TABLE public.workout_live_state
  DROP CONSTRAINT IF EXISTS workout_live_state_hr_source_check;
ALTER TABLE public.workout_live_state
  ADD CONSTRAINT workout_live_state_hr_source_check
  CHECK (hr_source IS NULL OR hr_source IN ('watch', 'sensor', 'phone'));

-- 1) Sat: uz svoj otisak upisuje i opsti.
CREATE OR REPLACE FUNCTION public.watch_update_workout_hr(p_token text, p_heart_rate integer, p_session_id uuid, p_active_calories numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_rows_updated integer;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.watch_pairing_tokens
  WHERE token = p_token
    AND revoked_at IS NULL
    AND expires_at > now();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  IF p_heart_rate < 30 OR p_heart_rate > 250 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_hr');
  END IF;

  PERFORM 1 FROM public.workout_session_logs
  WHERE id = p_session_id
    AND athlete_id = v_user_id
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_ended');
  END IF;

  UPDATE public.workout_live_state
  SET current_hr = p_heart_rate,
      current_active_calories = CASE
        WHEN p_active_calories IS NOT NULL AND p_active_calories >= 0
          THEN p_active_calories
        ELSE current_active_calories
      END,
      last_heartbeat = now(),
      watch_last_hr_at = now(),  -- namenski satov otisak (samo sat ga pise)
      hr_last_at = now(),        -- opsti otisak: puls stize, bez obzira odakle
      hr_source = 'watch'
  WHERE session_log_id = p_session_id
    AND athlete_id = v_user_id
    AND current_state IN ('active','rest');

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_live_session');
  END IF;

  RETURN jsonb_build_object('success', true);
END $function$;

GRANT EXECUTE ON FUNCTION public.watch_update_workout_hr(text, integer, uuid, numeric) TO public, anon, authenticated, service_role;

-- 2) Telefon: isti heartbeat, uz izvor pulsa.
--    Stara verzija se BRISE (parametar se ne moze dodati kroz REPLACE), pa nova
--    ima p_source sa podrazumevanom vrednoscu - vec objavljene aplikacije koje
--    salju samo p_session_id i p_hr i dalje pogadjaju ovu funkciju.
DROP FUNCTION IF EXISTS public.athlete_heartbeat(uuid, integer);

CREATE OR REPLACE FUNCTION public.athlete_heartbeat(p_session_id uuid, p_hr integer DEFAULT NULL::integer, p_source text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_rows int;
  v_source text;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;

  -- Sve sto nije prepoznata traka je "phone": klijent ne sme da upise proizvoljan
  -- izvor, a 'watch' preko ovog puta ne postoji (sat ide svojim RPC-om).
  v_source := CASE WHEN p_source = 'sensor' THEN 'sensor' ELSE 'phone' END;

  UPDATE public.workout_live_state
  SET last_heartbeat = now(),
      current_hr = COALESCE(p_hr, current_hr),
      hr_last_at = CASE WHEN p_hr IS NOT NULL THEN now() ELSE hr_last_at END,
      hr_source  = CASE WHEN p_hr IS NOT NULL THEN v_source ELSE hr_source END
  WHERE session_log_id = p_session_id
    AND athlete_id = v_user_id
    AND current_state IN ('active','rest');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('success', v_rows > 0);
END $function$;

GRANT EXECUTE ON FUNCTION public.athlete_heartbeat(uuid, integer, text) TO public, anon, authenticated, service_role;

-- 3) Trenerska lista: vrati i opsti otisak, da prikaz ne mora da pogadja.
--    Dve nove kolone menjaju povratni tip, a to Postgres ne dozvoljava kroz
--    REPLACE - zato DROP pa CREATE, u istoj transakciji.
DROP FUNCTION IF EXISTS public.get_active_athletes_for_trainer();

CREATE OR REPLACE FUNCTION public.get_active_athletes_for_trainer()
 RETURNS TABLE(athlete_id uuid, athlete_name text, session_id uuid, started_at timestamp with time zone, duration_seconds integer, current_exercise_name text, current_set_number integer, current_hr integer, current_active_calories numeric, watch_last_hr_at timestamp with time zone, hr_last_at timestamp with time zone, hr_source text, hr_zone integer, hr_zone_name text, current_state text, rest_ends_at timestamp with time zone, total_completed_sets integer, last_heartbeat timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    a.id as athlete_id,
    p.full_name as athlete_name,
    wsl.id as session_id,
    wsl.started_at,
    extract(epoch from (now() - wsl.started_at))::integer as duration_seconds,
    wls.current_exercise_name,
    wls.current_set_number,
    wls.current_hr,
    coalesce(wls.current_active_calories, 0) as current_active_calories,
    wls.watch_last_hr_at,
    wls.hr_last_at,
    wls.hr_source,
    public.hr_zone(wls.current_hr, public.athlete_effective_max_hr(a.id)) as hr_zone,
    public.hr_zone_name(public.hr_zone(wls.current_hr, public.athlete_effective_max_hr(a.id))) as hr_zone_name,
    wls.current_state,
    wls.rest_ends_at,
    coalesce(wls.total_completed_sets, 0) as total_completed_sets,
    coalesce(wls.last_heartbeat, wsl.started_at) as last_heartbeat
  from public.athletes a
  join public.profiles p on p.id = a.id
  join public.workout_session_logs wsl on wsl.athlete_id = a.id and wsl.is_active = true
  left join public.workout_live_state wls on wls.session_log_id = wsl.id
  where a.trainer_id = auth.uid()
  order by wsl.started_at desc;
$function$;

GRANT EXECUTE ON FUNCTION public.get_active_athletes_for_trainer() TO public, anon, authenticated, service_role;
