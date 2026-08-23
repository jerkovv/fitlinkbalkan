-- Max puls i serija pulsa vise ne mogu da se pokvare zavrsetkom treninga.
--
-- Puls ima DVA pisca: sat (HKLiveWorkoutBuilder, prava kumulativna statistika) i
-- telefon (obican useRef niz u komponenti, koji se brise na svaki reload
-- WKWebView-a). Server nije imao pravilo ko pobedjuje, nego obican COALESCE, pa
-- je pobedjivao onaj koji zavrsi POSLEDNJI. Kad telefon zavrsi posle sata,
-- live_hr_max postane maksimum onog kratkog repa koji je telefon uspeo da uhvati,
-- a hr_series se zameni tim istim repom.
--
-- U bazi se to vidi: 6 treninga ima seriju od TACNO JEDNE tacke (tri od njih duza
-- od 10 minuta), a kod 10 treninga se live_hr_max ne slaze sa maksimumom iz
-- sopstvene serije. Trka je nedeterministicka, pa je ponekad prezivela tacna
-- vrednost a ponekad ne.
--
-- Pravilo je sada: max samo raste, a serija se ne menja siromasnijom. Isto
-- pravilo za max vec je imao watch_report_metrics; ovde se izjednacava svuda.
CREATE OR REPLACE FUNCTION public.complete_workout_session(
  p_session_id uuid,
  p_hr_avg integer DEFAULT NULL::integer,
  p_hr_max integer DEFAULT NULL::integer,
  p_hr_min integer DEFAULT NULL::integer,
  p_active_calories numeric DEFAULT NULL::numeric,
  p_hr_series jsonb DEFAULT NULL::jsonb
)
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
  v_bogatija boolean;
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

  -- Nova serija se prihvata samo ako je BOGATIJA od one koja vec stoji. Telefonov
  -- rep od jedne tacke tako ne moze da pojede satovu seriju od hiljadu.
  v_bogatija := p_hr_series IS NOT NULL
                AND jsonb_typeof(p_hr_series) = 'array'
                AND (jsonb_typeof(v_session.hr_series) IS DISTINCT FROM 'array'
                     OR jsonb_array_length(p_hr_series) > jsonb_array_length(v_session.hr_series));

  update public.workout_session_logs
  set
    completed_at = now(),
    duration_seconds = v_duration,
    is_active = false,
    -- Prosek se menja samo uz seriju koja ga potkrepljuje: jedna tacka je davala
    -- "prosecan puls 98" za trening od sat i po.
    live_hr_avg = CASE WHEN v_bogatija OR live_hr_avg IS NULL
                       THEN COALESCE(NULLIF(p_hr_avg, 0), live_hr_avg)
                       ELSE live_hr_avg END,
    -- Max samo raste, i uzima u obzir i sam sadrzaj poslate serije, pa ni
    -- pogresan skalar sa klijenta ne moze da ga spusti.
    live_hr_max = GREATEST(
      COALESCE(live_hr_max, 0),
      COALESCE(NULLIF(p_hr_max, 0), 0),
      COALESCE((
        SELECT max(CASE WHEN jsonb_typeof(e) = 'array' THEN (e->>1)::numeric
                        ELSE (e->>'bpm')::numeric END)::int
        FROM jsonb_array_elements(COALESCE(p_hr_series, '[]'::jsonb)) e
      ), 0)
    ),
    live_hr_min = COALESCE(NULLIF(p_hr_min, 0), live_hr_min),
    active_calories = COALESCE(NULLIF(p_active_calories, 0), active_calories),
    hr_series = CASE WHEN v_bogatija THEN p_hr_series ELSE hr_series END,
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
