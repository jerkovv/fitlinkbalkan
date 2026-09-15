-- Zone pulsa posle treninga sa trakom (BLE narukvica/pojas).
--
-- Rezime racuna zone iz workout_session_logs.hr_series ([sekunde od pocetka, puls]).
-- Tu seriju je do sad punio SAMO sat, i to tek na kraju treninga. Traka salje puls
-- kroz athlete_heartbeat, koji je dirao samo zivi red - pa je trening sa trakom
-- ostajao bez serije, bez proseka i maksimuma, i bez zona u rezimeu.
--
-- Sada heartbeat, kad sat NE salje (nema svezeg watch_last_hr_at), sam dopise tacku
-- u seriju i odmah vodi prosek, maksimum i minimum. Kad sat radi, ne dira nista:
-- sat na kraju posalje svoju (gusću) seriju, a _engine_finish_workout je prihvata
-- jer je duza. Isto pravilo "bogatija serija pobedjuje" vazi i obrnuto.
--
-- _finalize_workout_session uz to prepisuje kalorije iz zivog reda kad sesija nema
-- svoje: uz traku ih telefon procenjuje i salje, ali su stajale samo u zivom redu.
-- Sat i dalje pregazi svojom vrednoscu (COALESCE(NULLIF(p, 0), ...)).

CREATE OR REPLACE FUNCTION public.athlete_heartbeat(
  p_session_id uuid,
  p_hr integer DEFAULT NULL::integer,
  p_source text DEFAULT NULL::text,
  p_calories numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_rows int;
  v_source text;
  v_sat_ziv boolean;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;

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
    AND current_state IN ('active','rest')
  RETURNING (watch_last_hr_at IS NOT NULL AND watch_last_hr_at >= now() - interval '40 seconds')
    INTO v_sat_ziv;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Seriju za zone vodi server dok sat ne salje (vidi zaglavlje migracije).
  IF v_rows > 0 AND p_hr BETWEEN 30 AND 250 AND NOT COALESCE(v_sat_ziv, false) THEN
    UPDATE public.workout_session_logs s
    SET hr_series = (CASE WHEN jsonb_typeof(s.hr_series) = 'array' THEN s.hr_series ELSE '[]'::jsonb END)
                    || jsonb_build_array(jsonb_build_array(
                         GREATEST(0, extract(epoch from (now() - s.started_at))::int), p_hr)),
        live_hr_max = GREATEST(COALESCE(s.live_hr_max, 0), p_hr),
        live_hr_min = LEAST(COALESCE(s.live_hr_min, p_hr), p_hr),
        -- Tekuci prosek: n = broj tacaka pre ove.
        live_hr_avg = round(
          (COALESCE(s.live_hr_avg, p_hr)::numeric
             * (CASE WHEN jsonb_typeof(s.hr_series) = 'array' THEN jsonb_array_length(s.hr_series) ELSE 0 END)
           + p_hr)
          / ((CASE WHEN jsonb_typeof(s.hr_series) = 'array' THEN jsonb_array_length(s.hr_series) ELSE 0 END) + 1)
        )::int
    WHERE s.id = p_session_id
      AND s.athlete_id = v_user_id
      AND s.is_active = true;
  END IF;

  RETURN jsonb_build_object('success', v_rows > 0);
END
$function$;

CREATE OR REPLACE FUNCTION public._finalize_workout_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.workout_session_logs s
  SET is_active = false,
      completed_at = now(),
      duration_seconds = extract(epoch from (now() - s.started_at))::int,
      total_volume_kg = (
        SELECT COALESCE(sum(reps * weight_kg), 0)
        FROM public.set_logs
        WHERE session_log_id = p_session_id AND done = true
      ),
      -- Kalorije iz zivog reda kad sesija nema svoje (trening sa trakom).
      active_calories = COALESCE(
        NULLIF(s.active_calories, 0),
        (SELECT NULLIF(ls.current_active_calories, 0)
           FROM public.workout_live_state ls
          WHERE ls.session_log_id = p_session_id
          LIMIT 1),
        s.active_calories
      )
  WHERE s.id = p_session_id;

  UPDATE public.workout_live_state
  SET current_state = 'completed'
  WHERE session_log_id = p_session_id;
END
$function$;
