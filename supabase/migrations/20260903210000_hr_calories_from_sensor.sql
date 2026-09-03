-- Kalorije kad puls stize sa trake.
--
-- Sat kalorije MERI i pise ih u current_active_calories. Traka daje samo puls,
-- pa ih telefon PROCENJUJE (Keytel, vidi src/lib/wearable/hrCalories.ts) i salje
-- kroz isti heartbeat. Procena se upisuje SAMO kad sat nije ziv - izmereno uvek
-- pobedjuje procenjeno, i ne sme da se dogodi da dva izvora naizmenicno gaze
-- istu kolonu.

DROP FUNCTION IF EXISTS public.athlete_heartbeat(uuid, integer, text);

CREATE OR REPLACE FUNCTION public.athlete_heartbeat(p_session_id uuid, p_hr integer DEFAULT NULL::integer, p_source text DEFAULT NULL::text, p_calories numeric DEFAULT NULL::numeric)
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
      hr_source  = CASE WHEN p_hr IS NOT NULL THEN v_source ELSE hr_source END,
      current_active_calories = CASE
        WHEN p_calories IS NOT NULL
             AND p_calories >= 0
             AND v_source = 'sensor'
             AND (watch_last_hr_at IS NULL OR watch_last_hr_at < now() - interval '40 seconds')
          THEN p_calories
        ELSE current_active_calories
      END
  WHERE session_log_id = p_session_id
    AND athlete_id = v_user_id
    AND current_state IN ('active','rest');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('success', v_rows > 0);
END $function$;

GRANT EXECUTE ON FUNCTION public.athlete_heartbeat(uuid, integer, text, numeric) TO public, anon, authenticated, service_role;
