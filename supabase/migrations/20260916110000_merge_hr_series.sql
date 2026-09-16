-- Puls se belezio na dva mesta: telefon svoj niz (1 Hz, samo dok je aplikacija budna) i
-- server kroz athlete_heartbeat. Na kraju treninga birao se DUZI niz, pa je onaj drugi
-- propadao - trening od 2h je tako umeo da zavrsi sa 16 minuta pulsa i zonama samo za taj
-- deo. Sad se oba spajaju po sekundi.
--
-- Uz to, trenerov prikaz uzivo (Live Activity) je "povezano" racunao samo po satu, pa je
-- vezbac sa senzorom (Huawei i slicni) izgledao kao da nema uredjaj.

CREATE OR REPLACE FUNCTION public._merge_hr_series(p_a jsonb, p_b jsonb, p_started_at timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH sve AS (
    SELECT (e->>0)::int AS t, (e->>1)::int AS bpm
    FROM jsonb_array_elements(
      public._normalize_hr_series(p_a, p_started_at) || public._normalize_hr_series(p_b, p_started_at)
    ) e
  ),
  po_sekundi AS (
    SELECT DISTINCT ON (t) t, bpm FROM sve ORDER BY t, bpm DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_array(t, bpm) ORDER BY t), '[]'::jsonb) FROM po_sekundi;
$$;

REVOKE EXECUTE ON FUNCTION public._merge_hr_series(jsonb, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;

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

  v_duration := extract(epoch from (now() - v_session.started_at))::integer;

  -- Spoj onoga sto je server zabelezio i onoga sto telefon donese na kraju.
  v_serija := public._merge_hr_series(v_session.hr_series, p_hr_series, v_session.started_at);
  select round(avg((e->>1)::numeric))::int, max((e->>1)::int)
    into v_avg, v_max
    from jsonb_array_elements(v_serija) e;

  update public.workout_session_logs
  set
    completed_at = now(),
    duration_seconds = v_duration,
    is_active = false,
    -- Prosek i max se racunaju iz spojene serije; skalar sa uredjaja je rezerva.
    live_hr_avg = COALESCE(v_avg, NULLIF(p_hr_avg, 0), live_hr_avg),
    live_hr_max = GREATEST(COALESCE(live_hr_max, 0), COALESCE(NULLIF(p_hr_max, 0), 0), COALESCE(v_max, 0)),
    live_hr_min = COALESCE(NULLIF(p_hr_min, 0), live_hr_min),
    active_calories = COALESCE(NULLIF(p_active_calories, 0), active_calories),
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
    SET active_calories = COALESCE(NULLIF(p_active_calories, 0), active_calories),
        live_hr_avg = COALESCE(v_avg, NULLIF(p_hr_avg, 0), live_hr_avg),
        live_hr_max = GREATEST(COALESCE(live_hr_max, 0), COALESCE(NULLIF(p_hr_max, 0), 0), COALESCE(v_max, 0)),
        hr_series = CASE WHEN jsonb_array_length(v_serija) > 0 THEN v_serija ELSE hr_series END
    WHERE id = p_session_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'state', 'completed');
END $function$;

-- Trener na zakljucanom ekranu: "povezano" je svaki ziv izvor pulsa (sat ILI senzor).
CREATE OR REPLACE FUNCTION public.trainer_live_content(p_trainer_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH active AS (
  SELECT
    COALESCE(p.full_name, 'Vezbac') AS name,
    wls.current_hr AS hr,
    round(wls.current_active_calories)::int AS cal,
    COALESCE(wls.current_state, 'active') AS current_state,
    (
      (wls.watch_last_hr_at IS NOT NULL AND wls.watch_last_hr_at > now() - interval '60 seconds')
      OR (wls.hr_last_at IS NOT NULL AND wls.hr_last_at > now() - interval '60 seconds')
    ) AS watch_connected,
    GREATEST(floor(extract(epoch FROM (now() - wsl.started_at)) / 60)::int, 0) AS duration_min,
    CASE
      WHEN wls.current_hr IS NULL OR wls.current_hr <= 0 THEN 'rest'
      WHEN wls.current_hr < 110 THEN 'easy'
      WHEN wls.current_hr < 140 THEN 'moderate'
      WHEN wls.current_hr < 165 THEN 'hard'
      ELSE 'max'
    END AS zone
  FROM public.athletes a
  JOIN public.workout_session_logs wsl
    ON wsl.athlete_id = a.id AND wsl.is_active = true
  LEFT JOIN public.workout_live_state wls
    ON wls.session_log_id = wsl.id
  LEFT JOIN public.profiles p ON p.id = a.id
  WHERE a.trainer_id = p_trainer_id
),
ranked AS (
  SELECT active.*,
         row_number() OVER (ORDER BY watch_connected DESC, hr DESC NULLS LAST) AS rn,
         count(*) OVER () AS total
  FROM active
)
SELECT jsonb_build_object(
  'athletes', COALESCE((
     SELECT jsonb_agg(jsonb_build_object(
        'name', name,
        'hr', hr,
        'cal', cal,
        'zone', zone,
        'isResting', (current_state = 'rest'),
        'watchConnected', watch_connected,
        'durationMin', duration_min
     ) ORDER BY rn)
     FROM ranked WHERE rn <= 3
  ), '[]'::jsonb),
  'activeCount', COALESCE((SELECT max(total) FROM ranked), 0),
  'moreCount', GREATEST(COALESCE((SELECT max(total) FROM ranked), 0) - 3, 0)
);
$function$;
