-- Kalorije racuna server, iz glavnog izvora pulsa, za svaki uredjaj.
--
-- Ranije: sat je slao svoj zbir (HealthKit), a telefon samo zbir iz Apple Zdravlja,
-- pa je trening sa trakom/narukvicom bez sata ostajao na 0 kcal.
--
-- Sada se zbir sabira ovde, korak po korak:
--   * traka (BLE, hr_source = 'sensor', sveza 20 s) je glavna: Keytel iz njenog pulsa
--   * kad traka utihne, sat: razlika njegovog zbira od poslednjeg javljanja (bez
--     duplog brojanja onoga sto je izmerio dok je traka vodila)
--   * bez trake i sata: puls sa telefona (Apple Zdravlje) kroz Keytel
-- Zbir nikad ne opada. Rupa veca od 30 s se ne racuna celom duzinom.

ALTER TABLE public.workout_live_state
  ADD COLUMN IF NOT EXISTS kcal_at timestamptz,
  ADD COLUMN IF NOT EXISTS watch_kcal_poslednje numeric;

-- kcal u minutu za puls vezbaca (Keytel 2005, isto kao web hrCalories.ts i iOS KalorijeIzPulsa).
-- Tezina: poslednje merenje, pa profil, pa 75 kg; godine iz godista, pa 30.
CREATE OR REPLACE FUNCTION public._kcal_u_minutu(p_athlete uuid, p_hr integer)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN p_hr IS NULL OR p_hr < 30 OR p_hr > 250 THEN 0 ELSE GREATEST(0,
    CASE WHEN x.pol IN ('female','zensko','žensko','z','ž','f')
      THEN (-20.4022 + 0.4472 * p_hr - 0.1263 * x.t + 0.074 * x.g) / 4.184
      ELSE (-55.0969 + 0.6309 * p_hr + 0.1988 * x.t + 0.2017 * x.g) / 4.184
    END) END
  FROM (
    SELECT lower(btrim(COALESCE(a.gender, ''))) AS pol,
           COALESCE(
             (SELECT bm.weight_kg FROM public.body_metrics bm
               WHERE bm.athlete_id = a.id AND bm.weight_kg > 0
               ORDER BY bm.recorded_on DESC LIMIT 1),
             NULLIF(a.weight_kg, 0),
             75)::numeric AS t,
           COALESCE(
             CASE WHEN a.birth_year BETWEEN 1900 AND extract(year FROM now())::int - 5
                  THEN extract(year FROM now())::int - a.birth_year END,
             30)::numeric AS g
    FROM (SELECT p_athlete AS id) k
    LEFT JOIN public.athletes a ON a.id = k.id
  ) x;
$function$;

REVOKE EXECUTE ON FUNCTION public._kcal_u_minutu(uuid, integer) FROM PUBLIC, anon, authenticated;

-- Telefon (i web): puls trake ili Apple Zdravlja. p_calories se vise ne koristi
-- (stari klijenti ga i dalje salju), zbir racuna server.
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
  v_sat_ziv boolean;
  v_puls_ok boolean;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;

  v_source := CASE WHEN p_source = 'sensor' THEN 'sensor' ELSE 'phone' END;
  v_puls_ok := p_hr BETWEEN 30 AND 250;

  UPDATE public.workout_live_state
  SET last_heartbeat = now(),
      current_hr = COALESCE(p_hr, current_hr),
      hr_last_at = CASE WHEN p_hr IS NOT NULL THEN now() ELSE hr_last_at END,
      hr_source  = CASE WHEN p_hr IS NOT NULL THEN v_source ELSE hr_source END,
      -- Tacka za "HR poslednjih 10 min" kod trenera (vidi _hr_recent_append).
      hr_recent  = public._hr_recent_append(hr_recent, p_hr),
      -- Traka racuna uvek; puls sa telefona samo dok sat cuti (sat inace racuna sam).
      current_active_calories = COALESCE(current_active_calories, 0) + CASE
        WHEN v_puls_ok AND kcal_at IS NOT NULL
             AND (v_source = 'sensor' OR watch_last_hr_at IS NULL OR watch_last_hr_at < now() - interval '40 seconds')
          THEN public._kcal_u_minutu(v_user_id, p_hr)
               * LEAST(GREATEST(extract(epoch FROM now() - kcal_at), 0), 30) / 60
        ELSE 0
      END,
      kcal_at = CASE
        WHEN v_puls_ok
             AND (v_source = 'sensor' OR watch_last_hr_at IS NULL OR watch_last_hr_at < now() - interval '40 seconds')
          THEN now()
        ELSE kcal_at
      END
  WHERE session_log_id = p_session_id
    AND athlete_id = v_user_id
    AND current_state IN ('active','rest')
  RETURNING (watch_last_hr_at IS NOT NULL AND watch_last_hr_at >= now() - interval '40 seconds')
    INTO v_sat_ziv;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 AND v_puls_ok AND NOT COALESCE(v_sat_ziv, false) THEN
    UPDATE public.workout_session_logs s
    -- {ts, bpm} kao telefon i sat.
    SET hr_series = (CASE WHEN jsonb_typeof(s.hr_series) = 'array' THEN s.hr_series ELSE '[]'::jsonb END)
                    || jsonb_build_array(jsonb_build_object(
                         'ts', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                         'bpm', p_hr)),
        live_hr_max = GREATEST(COALESCE(s.live_hr_max, 0), p_hr),
        live_hr_min = LEAST(COALESCE(s.live_hr_min, p_hr), p_hr),
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

-- Sat: dok je traka sveza, vodi traka (puls i kalorije); sat samo pamti svoj zbir.
-- Kad traka utihne, dodaje se samo ono sto je sat izmerio od tada.
CREATE OR REPLACE FUNCTION public.watch_update_workout_hr(p_token text, p_heart_rate integer, p_session_id uuid, p_active_calories numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_rows_updated integer;
  v_kcal numeric := CASE WHEN p_active_calories > 0 THEN p_active_calories END;
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
  SET current_hr = CASE
        WHEN hr_source = 'sensor' AND hr_last_at > now() - interval '20 seconds'
          THEN current_hr
        ELSE p_heart_rate
      END,
      hr_last_at = CASE
        WHEN hr_source = 'sensor' AND hr_last_at > now() - interval '20 seconds'
          THEN hr_last_at
        ELSE now()
      END,
      hr_source = CASE
        WHEN hr_source = 'sensor' AND hr_last_at > now() - interval '20 seconds'
          THEN hr_source
        ELSE 'watch'
      END,
      -- Isti izbor izvora kao current_hr: dok je traka sveza, grafik crta nju.
      hr_recent = CASE
        WHEN hr_source = 'sensor' AND hr_last_at > now() - interval '20 seconds'
          THEN hr_recent
        ELSE public._hr_recent_append(hr_recent, p_heart_rate)
      END,
      current_active_calories = COALESCE(current_active_calories, 0) + CASE
        WHEN hr_source = 'sensor' AND hr_last_at > now() - interval '20 seconds' THEN 0
        -- Sat meri: samo prirast od poslednjeg javljanja (restart sata ne oduzima).
        WHEN v_kcal IS NOT NULL THEN GREATEST(v_kcal - COALESCE(watch_kcal_poslednje, 0), 0)
        -- Sat jos nije javio kalorije: procena iz njegovog pulsa.
        WHEN watch_kcal_poslednje IS NULL AND kcal_at IS NOT NULL
          THEN public._kcal_u_minutu(v_user_id, p_heart_rate)
               * LEAST(GREATEST(extract(epoch FROM now() - kcal_at), 0), 30) / 60
        ELSE 0
      END,
      watch_kcal_poslednje = COALESCE(v_kcal, watch_kcal_poslednje),
      kcal_at = CASE
        WHEN hr_source = 'sensor' AND hr_last_at > now() - interval '20 seconds' THEN kcal_at
        ELSE now()
      END,
      last_heartbeat = now(),
      watch_last_hr_at = now()
  WHERE session_log_id = p_session_id
    AND athlete_id = v_user_id
    AND current_state IN ('active','rest');

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_live_session');
  END IF;

  RETURN jsonb_build_object('success', true);
END $function$;

-- Kraj treninga: veci od zbira uzivo i onoga sto je vec upisano (nista se ne gubi).
CREATE OR REPLACE FUNCTION public._finalize_workout_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.workout_session_logs s
  SET is_active = false,
      -- Vec zatvoren trening zadrzava svoj kraj; zaboravljen se zavrsava kod poslednjeg traga rada.
      completed_at = COALESCE(s.completed_at, public._kraj_treninga(p_session_id)),
      duration_seconds = CASE WHEN s.completed_at IS NOT NULL
        THEN COALESCE(s.duration_seconds, extract(epoch from (s.completed_at - s.started_at))::int)
        ELSE extract(epoch from (public._kraj_treninga(p_session_id) - s.started_at))::int END,
      total_volume_kg = (
        SELECT COALESCE(sum(reps * weight_kg), 0)
        FROM public.set_logs
        WHERE session_log_id = p_session_id AND done = true
      ),
      active_calories = NULLIF(GREATEST(
        COALESCE(s.active_calories, 0),
        COALESCE((SELECT ls.current_active_calories
                    FROM public.workout_live_state ls
                   WHERE ls.session_log_id = p_session_id
                   LIMIT 1), 0)
      ), 0)
  WHERE s.id = p_session_id;

  UPDATE public.workout_live_state
  SET current_state = 'completed'
  WHERE session_log_id = p_session_id;
END
$function$;

CREATE OR REPLACE FUNCTION public._engine_finish_workout(p_user_id uuid, p_session_id uuid, p_active_calories integer DEFAULT NULL::integer, p_hr_avg integer DEFAULT NULL::integer, p_hr_max integer DEFAULT NULL::integer, p_hr_series jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz;
  v_serija jsonb;
  v_avg int;
  v_max int;
BEGIN
  SELECT started_at INTO v_start FROM public.workout_session_logs
   WHERE id = p_session_id AND athlete_id = p_user_id AND is_active = true;
  IF v_start IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_ended');
  END IF;

  PERFORM public._finalize_workout_session(p_session_id);

  IF p_active_calories IS NOT NULL OR p_hr_avg IS NOT NULL OR p_hr_max IS NOT NULL OR p_hr_series IS NOT NULL THEN
    SELECT public._merge_hr_series(s.hr_series, p_hr_series, s.started_at) INTO v_serija
      FROM public.workout_session_logs s WHERE s.id = p_session_id;
    SELECT round(avg((e->>1)::numeric))::int, max((e->>1)::int)
      INTO v_avg, v_max FROM jsonb_array_elements(v_serija) e;

    UPDATE public.workout_session_logs
    -- Manji zbir ne prepisuje veci (zbir uzivo vec je upisan pri zatvaranju).
    SET active_calories = NULLIF(GREATEST(COALESCE(active_calories, 0), COALESCE(p_active_calories, 0)), 0),
        live_hr_avg = COALESCE(v_avg, NULLIF(p_hr_avg, 0), live_hr_avg),
        live_hr_max = GREATEST(COALESCE(live_hr_max, 0), COALESCE(NULLIF(p_hr_max, 0), 0), COALESCE(v_max, 0)),
        hr_series = CASE WHEN jsonb_array_length(v_serija) > 0 THEN v_serija ELSE hr_series END
    WHERE id = p_session_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'state', 'completed');
END $function$;

CREATE OR REPLACE FUNCTION public.complete_workout_session(p_session_id uuid, p_hr_avg integer DEFAULT NULL::integer, p_hr_max integer DEFAULT NULL::integer, p_hr_min integer DEFAULT NULL::integer, p_active_calories numeric DEFAULT NULL::numeric, p_hr_series jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_session public.workout_session_logs;
  v_total_volume numeric;
  v_set_count integer;
  v_duration integer;
  v_serija jsonb;
  v_avg int;
  v_max int;
  v_vec_gotov boolean;
  v_kraj timestamptz;
  v_uzivo numeric;
begin
  select * into v_session
  from public.workout_session_logs
  where id = p_session_id and athlete_id = auth.uid();

  if v_session.id is null then
    raise exception 'Session not found or not yours';
  end if;

  select
    coalesce(sum(reps * weight_kg), 0),
    count(*)
  into v_total_volume, v_set_count
  from public.set_logs
  where session_log_id = p_session_id and done = true;

  -- Trening koji je vec zatvoren (poslednja serija, sat, trener) zadrzava svoj kraj i
  -- trajanje: ovaj poziv tada samo dodaje puls i kalorije. Ranije je zakasneli poziv
  -- sa telefona pomerao kraj na "sada" i naduvavao trajanje.
  v_vec_gotov := v_session.completed_at is not null;
  -- Zaboravljen trening se zavrsava kod poslednjeg traga rada, ne u trenutku gasenja.
  v_kraj := public._kraj_treninga(p_session_id);
  v_duration := case when v_vec_gotov
    then coalesce(v_session.duration_seconds,
                  extract(epoch from (v_session.completed_at - v_session.started_at))::integer)
    else extract(epoch from (v_kraj - v_session.started_at))::integer end;

  -- Spoj onoga sto je server zabelezio i onoga sto telefon donese na kraju: ranije se
  -- birao duzi niz, pa je drugi propadao (trening od 2h sa 16 minuta pulsa).
  v_serija := public._merge_hr_series(v_session.hr_series, p_hr_series, v_session.started_at);
  select round(avg((e->>1)::numeric))::int, max((e->>1)::int)
    into v_avg, v_max
    from jsonb_array_elements(v_serija) e;

  -- Zbir koji je server sabrao uzivo (traka, sat, telefon).
  select ls.current_active_calories into v_uzivo
    from public.workout_live_state ls
   where ls.session_log_id = p_session_id
   limit 1;

  update public.workout_session_logs
  set
    completed_at = case when v_vec_gotov then completed_at else v_kraj end,
    duration_seconds = v_duration,
    is_active = false,
    live_hr_avg = COALESCE(v_avg, NULLIF(p_hr_avg, 0), live_hr_avg),
    -- Trening bez merenja pulsa nema najveci puls: prazno, ne nula.
    live_hr_max = NULLIF(GREATEST(COALESCE(live_hr_max, 0), COALESCE(NULLIF(p_hr_max, 0), 0), COALESCE(v_max, 0)), 0),
    live_hr_min = COALESCE(NULLIF(p_hr_min, 0), live_hr_min),
    -- Najveci od upisanog, poslatog i zbira uzivo: manji nikad ne prepisuje veci.
    active_calories = NULLIF(GREATEST(COALESCE(active_calories, 0), COALESCE(p_active_calories, 0), COALESCE(v_uzivo, 0)), 0),
    hr_series = CASE WHEN jsonb_array_length(v_serija) > 0 THEN v_serija ELSE hr_series END,
    total_volume_kg = v_total_volume
  where id = p_session_id;

  update public.workout_live_state
  set current_state = 'completed'
  where session_log_id = p_session_id;

  return jsonb_build_object(
    'session_id', p_session_id,
    'duration_seconds', v_duration,
    'total_volume_kg', v_total_volume,
    'sets_completed', v_set_count
  );
end $function$;

-- Telefon dobija i zbir kalorija i glavni izvor pulsa (traka/sat/telefon).
CREATE OR REPLACE FUNCTION public.athlete_poll_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid := auth.uid(); v_state jsonb;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;

  SELECT jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'server_now_ms', (extract(epoch FROM now())*1000)::bigint,
    'workout', jsonb_build_object(
      'session_id', wls.session_log_id,
      'current_exercise_name', wls.current_exercise_name,
      'current_exercise_idx', wls.current_exercise_idx,
      'current_set_number', wls.current_set_number,
      'total_sets', wls.total_sets,
      'current_state', wls.current_state,
      'current_hr', wls.current_hr,
      'watch_last_hr_at', wls.watch_last_hr_at,
      'hr_source', wls.hr_source,
      'hr_last_at', wls.hr_last_at,
      'current_active_calories', round(COALESCE(wls.current_active_calories, 0))::int,
      'last_heartbeat', wls.last_heartbeat,
      'plan_version', wls.plan_version,
      -- Brojke koje je vezbac ukucao za tekucu seriju na satu ili telefonu, pre zavrsetka.
      'draft', public._set_draft_json(wls.session_log_id),
      'started_at_ms', (extract(epoch FROM s.started_at)*1000)::bigint,
      'rest_ends_at_ms', (extract(epoch FROM wls.rest_ends_at)*1000)::bigint,
      'thumbnail_url', (SELECT e.thumbnail_url FROM public.exercises e WHERE e.name = wls.current_exercise_name LIMIT 1),
      -- Baterija sata, samo ako je izmerena u ovom treningu.
      'watch_battery', CASE WHEN wls.watch_battery_at >= s.started_at THEN wls.watch_battery END
    )
  ) INTO v_state
  FROM public.workout_live_state wls
  JOIN public.workout_session_logs s ON s.id = wls.session_log_id
  WHERE wls.athlete_id = v_user_id
    AND wls.current_state IN ('active','rest')
    AND wls.last_heartbeat > now() - interval '5 minutes'
  ORDER BY wls.last_heartbeat DESC
  LIMIT 1;

  IF v_state IS NULL THEN
    v_state := jsonb_build_object('success', true, 'user_id', v_user_id,
      'server_now_ms', (extract(epoch FROM now())*1000)::bigint, 'workout', NULL);
  END IF;
  RETURN v_state;
END $function$;
