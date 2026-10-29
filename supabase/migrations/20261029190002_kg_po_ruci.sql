-- Kilaza po ruci: "2× 15 kg" (bucice i slicno). Upisuje se kilaza JEDNE ruke.
--
--   * kolona kg_po_ruci na vezbi sablona, vezbi dodeljenog programa (i kopiji uz
--     trening) i na seriji (set_logs). Serija pamti stanje u trenutku upisa, pa
--     kasnija izmena programa ne menja istoriju.
--   * teret treninga (total_volume_kg) broji obe ruke: reps * kg * 2
--   * licni rekordi ostaju PO RUCI (poredi se upisana kilaza, matematika ista)
--   * plan (telefon, sat, Live Activity) nosi "kg_po_ruci"; tekst cilja je "2× 15 kg × 10"
--   * trener uzivo menja oznaku kroz trainer_set_kg_po_ruci (vazi samo za danas)
--
-- Ide posle 20261029190001 (kalorije): _finalize_workout_session i
-- complete_workout_session su uzeti iz te migracije, ovde je dodat samo teret.

ALTER TABLE public.program_template_exercises
  ADD COLUMN IF NOT EXISTS kg_po_ruci boolean NOT NULL DEFAULT false;
ALTER TABLE public.assigned_program_exercises
  ADD COLUMN IF NOT EXISTS kg_po_ruci boolean NOT NULL DEFAULT false;
ALTER TABLE public.set_logs
  ADD COLUMN IF NOT EXISTS kg_po_ruci boolean NOT NULL DEFAULT false;

-- Svaka nova serija preuzima oznaku od svoje vezbe (vazi za sve koji pisu u set_logs).
-- Ako trening ima svoju kopiju plana, a serija jos pokazuje na vezbu dana, vazi kopija.
CREATE OR REPLACE FUNCTION public._set_logs_kg_po_ruci()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.kg_po_ruci IS NOT TRUE THEN
    NEW.kg_po_ruci := COALESCE(
      (SELECT c.kg_po_ruci FROM public.assigned_program_exercises c
        WHERE c.session_log_id = NEW.session_log_id
          AND c.forked_from = NEW.exercise_id
        LIMIT 1),
      (SELECT a.kg_po_ruci FROM public.assigned_program_exercises a
        WHERE a.id = NEW.exercise_id),
      false);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._set_logs_kg_po_ruci() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_logs_kg_po_ruci ON public.set_logs;
CREATE TRIGGER trg_set_logs_kg_po_ruci
  BEFORE INSERT ON public.set_logs
  FOR EACH ROW EXECUTE FUNCTION public._set_logs_kg_po_ruci();

-- Kraj treninga (verzija iz 20261029190001) + teret sa obe ruke.
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
      -- Kilaza po ruci se broji dva puta (dve ruke).
      total_volume_kg = (
        SELECT COALESCE(sum(reps * weight_kg * CASE WHEN kg_po_ruci THEN 2 ELSE 1 END), 0)
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

-- Verzija iz 20261029190001 + teret sa obe ruke.
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

  -- Kilaza po ruci se broji dva puta (dve ruke).
  select
    coalesce(sum(reps * weight_kg * case when kg_po_ruci then 2 else 1 end), 0),
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

-- Ispravka serije posle kraja: teret se sabira ponovo, sa obe ruke.
CREATE OR REPLACE FUNCTION public.athlete_update_set(p_session_id uuid, p_ape_id uuid, p_set_number integer, p_reps integer, p_weight numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ape uuid;
  v_rows int;
  v_gotov boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Ispravka je dozvoljena i pola sata posle kraja: poslednja serija zatvara trening u istom
  -- pozivu, pa omaska u njoj (900 umesto 90 kg) inace ne bi mogla da se ispravi nikad.
  SELECT (completed_at IS NOT NULL) INTO v_gotov FROM public.workout_session_logs
   WHERE id = p_session_id AND athlete_id = v_uid
     AND (is_active = true OR completed_at > now() - interval '30 minutes');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_ended');
  END IF;

  IF p_reps IS NOT NULL AND (p_reps < 0 OR p_reps > 1000) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_reps');
  END IF;
  IF p_weight IS NOT NULL AND (p_weight < 0 OR p_weight > 1000) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_weight');
  END IF;

  v_ape := COALESCE(public._session_plan_row(p_session_id, p_ape_id), p_ape_id);

  UPDATE public.set_logs
  SET reps      = COALESCE(p_reps, reps),
      weight_kg = COALESCE(p_weight, weight_kg)
  WHERE session_log_id = p_session_id
    AND exercise_id IN (v_ape, p_ape_id)
    AND set_number = p_set_number
    AND done = true
    AND logged_by_trainer IS NOT TRUE;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.set_logs
       WHERE session_log_id = p_session_id
         AND exercise_id IN (v_ape, p_ape_id)
         AND set_number = p_set_number
         AND logged_by_trainer = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'trainer_value');
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'not_logged');
  END IF;

  -- Zatvoren trening vec ima sabran teret; posle ispravke se sabira ponovo.
  -- Kilaza po ruci se broji dva puta (dve ruke).
  IF v_gotov THEN
    UPDATE public.workout_session_logs s
       SET total_volume_kg = (SELECT COALESCE(sum(reps * weight_kg * CASE WHEN kg_po_ruci THEN 2 ELSE 1 END), 0)
                                FROM public.set_logs
                               WHERE session_log_id = p_session_id AND done = true)
     WHERE s.id = p_session_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'set_number', p_set_number);
END;
$function$;

-- Naknadno upisan trening: svaka vezba moze da posalje "kg_po_ruci": true.
CREATE OR REPLACE FUNCTION public.trainer_create_past_workout(p_athlete_id uuid, p_started_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_duration_minutes integer DEFAULT NULL::integer, p_exercises jsonb DEFAULT NULL::jsonb, p_title text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trener uuid := auth.uid();
  v_session uuid;
  v_vezbi int;
  v_vezba jsonb;
  v_ape uuid;
  v_poz int := 0;
  v_serija jsonb;
  v_sn int;
  v_kardio boolean;
  v_min int;
  v_reps text;
  v_pocetak timestamptz;
  v_kraj timestamptz;
  v_sekundi int;
BEGIN
  PERFORM public._trainer_offline_guard(p_athlete_id);

  -- Vreme je opciono. Kad ga nema, trening nosi trenutak upisa i ostaje bez
  -- trajanja (NULL), da prikaz ne izmislja minute kojih niko nije merio.
  v_pocetak := COALESCE(p_started_at, now());
  IF p_started_at IS NOT NULL THEN
    IF p_started_at > now() THEN
      RAISE EXCEPTION 'Trening ne moze da bude u buducnosti';
    END IF;
    IF p_started_at < now() - interval '90 days' THEN
      RAISE EXCEPTION 'Trening stariji od 90 dana se ne upisuje';
    END IF;
  END IF;

  IF p_duration_minutes IS NOT NULL
     AND (p_duration_minutes < 1 OR p_duration_minutes > 600) THEN
    RAISE EXCEPTION 'Trajanje mora biti izmedju 1 i 600 minuta';
  END IF;
  v_sekundi := CASE WHEN p_duration_minutes IS NULL THEN NULL ELSE p_duration_minutes * 60 END;
  v_kraj := CASE WHEN p_duration_minutes IS NULL
                 THEN v_pocetak
                 ELSE v_pocetak + make_interval(mins => p_duration_minutes) END;

  IF p_exercises IS NULL OR jsonb_typeof(p_exercises) <> 'array' THEN
    RAISE EXCEPTION 'Nije prosledjena nijedna vezba';
  END IF;
  v_vezbi := jsonb_array_length(p_exercises);
  IF v_vezbi < 1 THEN RAISE EXCEPTION 'Nije prosledjena nijedna vezba'; END IF;
  IF v_vezbi > 30 THEN RAISE EXCEPTION 'Najvise 30 vezbi po treningu'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_exercises) x
    WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = (x->>'exercise_id')::uuid)
  ) THEN
    RAISE EXCEPTION 'Nepoznata vezba';
  END IF;

  -- Zastita od dvostrukog slanja SAMO kad je vreme izricito poslato (vidi zaglavlje).
  IF p_started_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workout_session_logs s
    WHERE s.athlete_id = p_athlete_id
      AND s.entered_by_trainer = v_trener
      AND date_trunc('minute', s.started_at) = date_trunc('minute', p_started_at)
  ) THEN
    RAISE EXCEPTION 'Trening sa istim pocetkom je vec upisan';
  END IF;

  -- ZAVRSENA OD RODJENJA: is_active=false, completed_at popunjen, i NIJEDAN red
  -- u workout_live_state. Otud je nedodirljiva za sve zive trenerove RPC-eve.
  INSERT INTO public.workout_session_logs
    (athlete_id, started_at, completed_at, duration_seconds, is_active,
     entered_by_trainer, entry_title, notes)
  VALUES
    (p_athlete_id, v_pocetak, v_kraj, v_sekundi, false,
     v_trener, NULLIF(btrim(COALESCE(p_title, '')), ''), p_notes)
  RETURNING id INTO v_session;

  FOR v_vezba IN SELECT * FROM jsonb_array_elements(p_exercises)
  LOOP
    v_poz := v_poz + 1;

    IF jsonb_typeof(v_vezba->'sets') <> 'array'
       OR jsonb_array_length(v_vezba->'sets') < 1
       OR jsonb_array_length(v_vezba->'sets') > 12 THEN
      RAISE EXCEPTION 'Svaka vezba mora imati izmedju 1 i 12 serija';
    END IF;

    SELECT COALESCE(e.is_duration_based, false) INTO v_kardio
    FROM public.exercises e WHERE e.id = (v_vezba->>'exercise_id')::uuid;

    -- Kardio se meri minutima, ne serijama, i triger trg_cardio_single_set svakako
    -- pribija sets na 1. Da upis ne bi tiho izgubio serije, ovde se to trazi otvoreno.
    IF v_kardio AND jsonb_array_length(v_vezba->'sets') <> 1 THEN
      RAISE EXCEPTION 'Kardio vezba se upisuje kao jedna stavka sa minutima';
    END IF;

    v_min := round(NULLIF((v_vezba->'sets'->0->>'duration_minutes'), '')::numeric)::int;
    IF v_kardio AND (v_min IS NULL OR v_min < 1 OR v_min > 600) THEN
      RAISE EXCEPTION 'Minuti kardio vezbe moraju biti izmedju 1 i 600';
    END IF;

    -- Plan reda je do sada bio tvrdo '0', pa je detalj treninga ispisivao
    -- besmisleno "Plan: 3 x 0". Upisan trening nema plan; najbliza istina je ono
    -- sto je stvarno odradjeno u prvoj seriji.
    v_reps := COALESCE(round(NULLIF(v_vezba->'sets'->0->>'reps', '')::numeric)::int::text, '0');

    -- Vezbe zive UZ SESIJU (day_id NULL), isto kao kad ih trener doda usred
    -- slobodnog treninga. Program vezbaca se ovim ne dira.
    -- kg_po_ruci je opciono; triger ga sa vezbe prepisuje na svaku seriju.
    INSERT INTO public.assigned_program_exercises
      (session_log_id, exercise_id, position, sets, reps, rest_seconds,
       duration_minutes, superset_group, kg_po_ruci)
    VALUES
      (v_session, (v_vezba->>'exercise_id')::uuid, v_poz,
       jsonb_array_length(v_vezba->'sets'), v_reps,
       COALESCE((v_vezba->>'rest_seconds')::int, 90),
       CASE WHEN v_kardio THEN v_min END,
       NULLIF(v_vezba->>'superset_group', '')::smallint,
       COALESCE(NULLIF(v_vezba->>'kg_po_ruci', '')::boolean, false) AND NOT v_kardio)
    RETURNING id INTO v_ape;

    v_sn := 0;
    FOR v_serija IN SELECT * FROM jsonb_array_elements(v_vezba->'sets')
    LOOP
      v_sn := v_sn + 1;
      INSERT INTO public.set_logs
        (session_log_id, exercise_id, set_number, reps, weight_kg, rpe,
         duration_minutes, done, started_at, completed_at, logged_by_trainer)
      VALUES
        (v_session, v_ape, v_sn,
         NULLIF(round(NULLIF(v_serija->>'reps', '')::numeric)::int, 0),
         (v_serija->>'weight_kg')::numeric,
         (v_serija->>'rpe')::numeric,
         round(NULLIF((v_serija->>'duration_minutes'), '')::numeric)::int,
         true, v_pocetak, v_pocetak, true);
    END LOOP;
  END LOOP;

  -- UZASTOPNOST JE INVARIJANTA i ovde, iako motor pozicije ovaj trening nikad ne
  -- gleda: prikaz crta krug kao jednu celinu preko suseda, pa isprekidan krug ne
  -- bi bio krug nego dve odvojene oznake.
  IF EXISTS (
    SELECT 1 FROM (
      SELECT ape.superset_group AS g, count(*) AS n,
             max(ape.position) - min(ape.position) AS raspon
      FROM public.assigned_program_exercises ape
      WHERE ape.session_log_id = v_session AND ape.superset_group IS NOT NULL
      GROUP BY ape.superset_group
    ) q WHERE q.n < 2 OR q.raspon <> q.n - 1
  ) THEN
    RAISE EXCEPTION 'Superset mora imati bar dve vezbe, jednu uz drugu';
  END IF;

  -- Kilaza po ruci se broji dva puta (dve ruke).
  UPDATE public.workout_session_logs
  SET total_volume_kg = (
    SELECT COALESCE(sum(COALESCE(reps,0) * COALESCE(weight_kg,0) * CASE WHEN kg_po_ruci THEN 2 ELSE 1 END), 0)
    FROM public.set_logs WHERE session_log_id = v_session AND done = true
  )
  WHERE id = v_session;

  RETURN v_session;
END;
$function$;

-- Dodela programa prenosi i kg_po_ruci sa sablona.
CREATE OR REPLACE FUNCTION public.assign_program_to_athlete(p_template_id uuid, p_athlete_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trainer_id uuid := auth.uid();
  v_template_name text; v_template_owner uuid; v_athlete_owner uuid;
  v_assigned_id uuid; v_day record; v_new_day_id uuid; v_days_count int := 0;
  v_ex record; v_new_ex_id uuid;
BEGIN
  PERFORM public.require_active_trainer_sub();
  IF v_trainer_id IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni'; END IF;
  SELECT name, trainer_id INTO v_template_name, v_template_owner
  FROM public.program_templates WHERE id = p_template_id;
  IF v_template_name IS NULL THEN RAISE EXCEPTION 'Program template ne postoji'; END IF;
  IF v_template_owner <> v_trainer_id THEN RAISE EXCEPTION 'Nemate pristup ovom template-u'; END IF;
  SELECT trainer_id INTO v_athlete_owner FROM public.athletes WHERE id = p_athlete_id;
  IF v_athlete_owner IS NULL THEN RAISE EXCEPTION 'Vezbac ne postoji'; END IF;
  IF v_athlete_owner <> v_trainer_id THEN RAISE EXCEPTION 'Ovaj vezbac nije vas'; END IF;

  INSERT INTO public.assigned_programs (athlete_id, trainer_id, name, source_template_id, published_at)
  VALUES (p_athlete_id, v_trainer_id, v_template_name, p_template_id, now())
  RETURNING id INTO v_assigned_id;

  FOR v_day IN SELECT id, day_number, name FROM public.program_template_days
    WHERE template_id = p_template_id ORDER BY day_number
  LOOP
    INSERT INTO public.assigned_program_days (assigned_program_id, day_number, name)
    VALUES (v_assigned_id, v_day.day_number, v_day.name) RETURNING id INTO v_new_day_id;

    -- superset_group i kg_po_ruci MORAJU da stoje ovde: INSERT nize ih cita sa v_ex.
    FOR v_ex IN SELECT id, exercise_id, position, sets, reps, weight_kg, rest_seconds, duration_minutes, superset_group, kg_po_ruci
      FROM public.program_template_exercises WHERE day_id = v_day.id ORDER BY position
    LOOP
      INSERT INTO public.assigned_program_exercises
        (day_id, exercise_id, position, sets, reps, weight_kg, rest_seconds, duration_minutes, superset_group, kg_po_ruci)
      VALUES
        (v_new_day_id, v_ex.exercise_id, v_ex.position, v_ex.sets, v_ex.reps, v_ex.weight_kg, v_ex.rest_seconds, v_ex.duration_minutes, v_ex.superset_group, v_ex.kg_po_ruci)
      RETURNING id INTO v_new_ex_id;

      INSERT INTO public.assigned_program_exercise_sets
        (assigned_exercise_id, set_number, reps, weight_kg, rest_seconds, notes, set_type)
      SELECT v_new_ex_id, s.set_number, s.reps, s.weight_kg, s.rest_seconds, s.notes, s.set_type
      FROM public.program_template_exercise_sets s
      WHERE s.template_exercise_id = v_ex.id
      ORDER BY s.set_number;
    END LOOP;

    v_days_count := v_days_count + 1;
  END LOOP;
  IF v_days_count = 0 THEN RAISE EXCEPTION 'Template nema nijedan dan. Dodaj bar jedan dan pre dodele.'; END IF;
  RETURN v_assigned_id;
END;
$function$;

-- Kopija plana uz trening prenosi i kg_po_ruci.
CREATE OR REPLACE FUNCTION public._fork_session_plan(p_session_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_day uuid; v_broj int;
BEGIN
  SELECT count(*) INTO v_broj FROM public.assigned_program_exercises
  WHERE session_log_id = p_session_id;
  IF v_broj > 0 THEN RETURN 0; END IF;

  SELECT day_id INTO v_day FROM public.workout_session_logs WHERE id = p_session_id;
  IF v_day IS NULL THEN RETURN 0; END IF;

  WITH src AS (
    SELECT ape.*, gen_random_uuid() AS novi_id
    FROM public.assigned_program_exercises ape
    WHERE ape.day_id = v_day
  ),
  ubaci_vezbe AS (
    INSERT INTO public.assigned_program_exercises
      (id, day_id, session_log_id, forked_from, exercise_id, position, sets, reps,
       weight_kg, rest_seconds, notes, deleted_at, duration_minutes, superset_group, kg_po_ruci)
    SELECT s.novi_id, NULL, p_session_id, s.id, s.exercise_id, s.position, s.sets, s.reps,
           s.weight_kg, s.rest_seconds, s.notes, s.deleted_at, s.duration_minutes, s.superset_group, s.kg_po_ruci
    FROM src s
    RETURNING 1
  ),
  ubaci_serije AS (
    INSERT INTO public.assigned_program_exercise_sets
      (assigned_exercise_id, set_number, reps, weight_kg, rest_seconds, notes, set_type)
    SELECT s.novi_id, aps.set_number, aps.reps, aps.weight_kg, aps.rest_seconds, aps.notes, aps.set_type
    FROM src s
    JOIN public.assigned_program_exercise_sets aps ON aps.assigned_exercise_id = s.id
    RETURNING 1
  )
  UPDATE public.set_logs sl
  SET exercise_id = s.novi_id
  FROM src s
  WHERE sl.session_log_id = p_session_id AND sl.exercise_id = s.id;

  SELECT count(*) INTO v_broj FROM public.assigned_program_exercises
  WHERE session_log_id = p_session_id;
  RETURN v_broj;
END;
$function$;

-- Plan treninga nosi kg_po_ruci po vezbi.
CREATE OR REPLACE FUNCTION public.get_session_plan_full(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_athlete uuid; v_day uuid; v_racvan boolean := false;
  v_glava jsonb; v_exercises jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT s.athlete_id, s.day_id INTO v_athlete, v_day
  FROM public.workout_session_logs s WHERE s.id = p_session_id;
  IF v_athlete IS NULL THEN RETURN NULL; END IF;

  IF v_uid <> v_athlete AND NOT public.is_my_athlete(v_uid, v_athlete) THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.assigned_program_exercises
                 WHERE session_log_id = p_session_id) INTO v_racvan;

  SELECT jsonb_build_object(
    'session_id', p_session_id,
    'day_id', v_day,
    'day_number', d.day_number,
    'day_name', COALESCE(d.name, 'Slobodan trening'),
    'assigned_program_id', d.assigned_program_id,
    'is_free', v_day IS NULL,
    'plan_complete', (public.watch_compute_position(p_session_id)->>'complete')::boolean
  ) INTO v_glava
  FROM (SELECT 1) x
  LEFT JOIN public.assigned_program_days d ON d.id = v_day;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ape.id,
      'position', ape.position,
      'superset_group', ape.superset_group,
      'kg_po_ruci', ape.kg_po_ruci,
      'sets', ape.sets,
      'reps', CASE WHEN ape.reps ~ '^[0-9]+$' THEN ape.reps::integer ELSE NULL END,
      'weight_kg', ape.weight_kg,
      'rest_seconds', ape.rest_seconds,
      'duration_minutes', ape.duration_minutes,
      'notes', ape.notes,
      'set_details', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'set_number', aps.set_number,
          'reps', aps.reps,
          'weight_kg', aps.weight_kg,
          'rest_seconds', aps.rest_seconds,
          'set_type', aps.set_type
        ) ORDER BY aps.set_number)
        FROM public.assigned_program_exercise_sets aps
        WHERE aps.assigned_exercise_id = ape.id
      ), '[]'::jsonb),
      'exercise_id', e.id,
      'exercise', jsonb_build_object(
        'name', e.name,
        'name_en', e.name_en,
        'description', e.description,
        'instructions', e.instructions,
        'primary_muscle', e.primary_muscle,
        'equipment', e.equipment,
        'thumbnail_url', e.thumbnail_url,
        'video_url', e.video_url,
        'is_duration_based', e.is_duration_based
      )
    ) ORDER BY ape.position
  ), '[]'::jsonb)
  INTO v_exercises
  FROM public.assigned_program_exercises ape
  JOIN public.exercises e ON e.id = ape.exercise_id
  WHERE ape.deleted_at IS NULL
    AND (CASE WHEN v_racvan THEN ape.session_log_id = p_session_id
              ELSE v_day IS NOT NULL AND ape.day_id = v_day END);

  RETURN v_glava || jsonb_build_object('exercises', v_exercises);
END;
$function$;

-- Dan programa nosi kg_po_ruci po vezbi.
CREATE OR REPLACE FUNCTION public.get_workout_day_full(p_day_id uuid, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_day jsonb;
  v_exercises jsonb;
  v_sess uuid := p_session_id;
  v_racvan boolean := false;
begin
  select jsonb_build_object(
    'day_id', d.id,
    'day_number', d.day_number,
    'day_name', d.name,
    'notes', d.notes,
    'assigned_program_id', p.id,
    'program_name', p.name
  ) into v_day
  from public.assigned_program_days d
  join public.assigned_programs p on p.id = d.assigned_program_id
  where d.id = p_day_id
    and d.deleted_at is null
    and (p.athlete_id = auth.uid() or p.trainer_id = auth.uid());

  if v_day is null then
    return null;
  end if;

  -- Poslata sesija vazi samo ako je bas za ovaj dan i ako pripada onome ko zove ili
  -- njegovom vezbacu. Ranije se uzimala kako je stigla, pa je tudji izmenjen plan
  -- (vezbe, ciljevi, trenerove beleske) mogao da se procita uz sopstveni dan.
  if v_sess is not null and not exists (
    select 1 from public.workout_session_logs s
    where s.id = v_sess
      and s.day_id = p_day_id
      and (s.athlete_id = auth.uid()
           or exists (select 1 from public.athletes a
                      where a.id = s.athlete_id and a.trainer_id = auth.uid()))
  ) then
    v_sess := null;
  end if;

  -- Stari klijent nije poslao sesiju: nadji vezbacev ziv trening za ovaj dan.
  if v_sess is null then
    select s.id into v_sess
    from public.workout_session_logs s
    where s.day_id = p_day_id
      and s.athlete_id = auth.uid()
      and s.is_active = true
    order by s.started_at desc
    limit 1;
  end if;

  if v_sess is not null then
    select exists (
      select 1 from public.assigned_program_exercises
      where session_log_id = v_sess
    ) into v_racvan;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', ape.id,
      'position', ape.position,
      'superset_group', ape.superset_group,
      'kg_po_ruci', ape.kg_po_ruci,
      'sets', ape.sets,
      'reps', case when ape.reps ~ '^[0-9]+$' then ape.reps::integer else null end,
      'weight_kg', ape.weight_kg,
      'rest_seconds', ape.rest_seconds,
      'duration_minutes', ape.duration_minutes,
      'notes', ape.notes,
      'set_details', coalesce((
        select jsonb_agg(jsonb_build_object(
          'set_number', aps.set_number,
          'reps', aps.reps,
          'weight_kg', aps.weight_kg,
          'rest_seconds', aps.rest_seconds,
          'set_type', aps.set_type
        ) order by aps.set_number)
        from public.assigned_program_exercise_sets aps
        where aps.assigned_exercise_id = ape.id
      ), '[]'::jsonb),
      'exercise_id', e.id,
      'exercise', jsonb_build_object(
        'name', e.name,
        'name_en', e.name_en,
        'description', e.description,
        'instructions', e.instructions,
        'primary_muscle', e.primary_muscle,
        'equipment', e.equipment,
        'thumbnail_url', e.thumbnail_url,
        'video_url', e.video_url,
        'is_duration_based', e.is_duration_based
      )
    ) order by ape.position
  ), '[]'::jsonb)
  into v_exercises
  from public.assigned_program_exercises ape
  join public.exercises e on e.id = ape.exercise_id
  where ape.deleted_at is null
    and (case when v_racvan then ape.session_log_id = v_sess
              else ape.day_id = p_day_id end);

  return v_day || jsonb_build_object('exercises', v_exercises);
end $function$;

-- Detalj treninga: kg_po_ruci na vezbi i na svakoj seriji. Za vezbu vazi ono sto
-- su serije zapamtile pri upisu; bez serija vazi plan.
CREATE OR REPLACE FUNCTION public.get_inapp_workout_detail(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_athlete uuid;
  v_day_id uuid;
  v_completed timestamptz;
  v_result jsonb;
  v_exercises jsonb;
  v_cfg_max int;
  v_birth_year int;
  v_max_hr int;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT athlete_id, day_id, completed_at INTO v_athlete, v_day_id, v_completed
  FROM public.workout_session_logs WHERE id = p_session_id;
  IF v_athlete IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_caller <> v_athlete AND NOT EXISTS (
    SELECT 1 FROM public.athletes a WHERE a.id = v_athlete AND a.trainer_id = v_caller
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  -- Max puls za zone: rucno podeseno ako postoji, inace 220 minus godine, inace fallback 190
  SELECT max_hr INTO v_cfg_max FROM public.user_hr_config WHERE user_id = v_athlete AND max_hr > 0;
  SELECT birth_year INTO v_birth_year FROM public.athletes WHERE id = v_athlete;
  v_max_hr := COALESCE(
    v_cfg_max,
    CASE WHEN v_birth_year IS NOT NULL AND v_birth_year > 1900
         THEN 220 - (EXTRACT(YEAR FROM now())::int - v_birth_year)
         ELSE 190 END
  );
  IF v_max_hr IS NULL OR v_max_hr < 100 THEN v_max_hr := 190; END IF;

  -- Spisak vezbi sa planom (sazetak + per-set ciljevi) i uradjenim serijama
  SELECT jsonb_agg(ex_row ORDER BY ex_pos) INTO v_exercises
  FROM (
    SELECT ape.position AS ex_pos,
      jsonb_build_object(
        -- Red vezbe u ovom treningu: treba za ispravku serije posle kraja (athlete_update_set).
        'ape_id', ape.id,
        'exercise_name', COALESCE(e.name, 'Vezba'),
        'superset_group', ape.superset_group,
        -- Kilaza po ruci: snimak sa serija ovog treninga, inace plan.
        'kg_po_ruci', COALESCE((
          SELECT bool_or(sl.kg_po_ruci) FROM public.set_logs sl
          WHERE sl.session_log_id = p_session_id AND sl.exercise_id = ape.id
        ), ape.kg_po_ruci),
        'planned_sets', ape.sets,
        'planned_reps', ape.reps,
        'planned_weight_kg', ape.weight_kg,
        'planned_duration_minutes', ape.duration_minutes,
        'is_duration_based', COALESCE(e.is_duration_based, false),
        'planned_set_details', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'set_number', aps.set_number,
            'reps', aps.reps,
            'weight_kg', aps.weight_kg,
            'rest_seconds', aps.rest_seconds,
            'set_type', aps.set_type
          ) ORDER BY aps.set_number)
          FROM public.assigned_program_exercise_sets aps
          WHERE aps.assigned_exercise_id = ape.id
        ), '[]'::jsonb),
        'sets', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'set_number', sl.set_number,
            'reps', sl.reps,
            'weight_kg', sl.weight_kg,
            'kg_po_ruci', sl.kg_po_ruci,
            'rpe', sl.rpe,
            'duration_minutes', sl.duration_minutes,
            'done', sl.done
          ) ORDER BY sl.set_number)
          FROM public.set_logs sl
          WHERE sl.session_log_id = p_session_id AND sl.exercise_id = ape.id
        ), '[]'::jsonb),
        'done_count', (
          SELECT count(*) FROM public.set_logs sl
          WHERE sl.session_log_id = p_session_id AND sl.exercise_id = ape.id AND sl.done = true
        )
      ) AS ex_row
    FROM public.assigned_program_exercises ape
    LEFT JOIN public.exercises e ON e.id = ape.exercise_id
    -- Trening bez svoje kopije plana cita vezbe dana. Trener taj dan menja i kasnije, pa:
    -- vezba sa upisanim serijama ostaje u istoriji i kad je posle uklonjena iz programa,
    -- vezba uklonjena tek posle treninga ostaje kao neuradjena, a vezba dodata posle
    -- zavrsetka se ne prikazuje (created_at NULL = red stariji od ove kolone, vazi kao ranije).
    WHERE (CASE WHEN EXISTS (SELECT 1 FROM public.assigned_program_exercises z
                              WHERE z.session_log_id = p_session_id)
                 THEN ape.session_log_id = p_session_id AND ape.deleted_at IS NULL
                 ELSE ape.day_id = v_day_id AND (
                   EXISTS (SELECT 1 FROM public.set_logs sl
                           WHERE sl.session_log_id = p_session_id AND sl.exercise_id = ape.id)
                   OR ((ape.deleted_at IS NULL
                        OR (v_completed IS NOT NULL AND ape.deleted_at > v_completed))
                       AND (v_completed IS NULL OR ape.created_at IS NULL
                            OR ape.created_at <= v_completed))
                 ) END)
  ) sub;

  SELECT jsonb_build_object(
    'success', true,
    'id', s.id,
    'day_number', s.day_number,
    'started_at', s.started_at,
    'completed_at', s.completed_at,
    'duration_seconds', s.duration_seconds,
    'total_volume_kg', s.total_volume_kg,
    'active_calories', s.active_calories,
    'hr_avg', s.live_hr_avg,
    'hr_max', NULLIF(s.live_hr_max, 0),
    -- Uvek [[sekunde, bpm], ...], bez obzira kojim oblikom je puls upisan.
    'hr_series', hr.ser,
    'max_hr', v_max_hr,
    'zones', public._compute_hr_zones(hr.ser, v_max_hr),
    'notes', s.notes,
    'program_name', ap.name,
    'day_name', ad.name,
    'entry_title', s.entry_title,
    'entered_by_trainer', s.entered_by_trainer,
    'birth_year', ath.birth_year,
    'sets_done', (SELECT count(*) FROM public.set_logs sl WHERE sl.session_log_id = s.id AND sl.done = true),
    'exercises', COALESCE(v_exercises, '[]'::jsonb)
  ) INTO v_result
  FROM public.workout_session_logs s
  CROSS JOIN LATERAL (SELECT public._normalize_hr_series(s.hr_series, s.started_at) AS ser) hr
  LEFT JOIN public.assigned_programs ap ON ap.id = s.assigned_program_id
  LEFT JOIN public.assigned_program_days ad ON ad.id = s.day_id
  LEFT JOIN public.athletes ath ON ath.id = s.athlete_id
  WHERE s.id = p_session_id;

  RETURN v_result;
END $function$;

-- Plan za sat nosi kg_po_ruci po vezbi.
CREATE OR REPLACE FUNCTION public.watch_get_workout_plan(p_token text, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_day_id uuid;
  v_exercises jsonb;
  v_all_done boolean;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.watch_pairing_tokens
  WHERE token = p_token
    AND revoked_at IS NULL
    AND expires_at > now();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  -- day_id NULL je legitiman (slobodan trening), pa postojanje sesije ide
  -- kroz zaseban FOUND, ne kroz vrednost day_id.
  SELECT day_id INTO v_day_id
  FROM public.workout_session_logs
  WHERE id = p_session_id
    AND athlete_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  WITH plan AS (
    SELECT ape.id AS ape_id,
           ape.position,
           ape.superset_group,
           ape.kg_po_ruci,
           (row_number() OVER (ORDER BY ape.position) - 1)::int AS exercise_idx,
           ape.sets,
           COALESCE(ape.rest_seconds, 60) AS rest_seconds,
           ape.reps AS reps_text,
           CASE WHEN ape.reps ~ '^[0-9]+$' THEN ape.reps::int ELSE NULL END AS planned_reps,
           ape.weight_kg AS planned_weight,
           ape.duration_minutes AS duration_minutes,
           COALESCE(e.is_duration_based, false) AS is_duration_based,
           COALESCE(e.name_en, e.name) AS exercise_name,
           e.thumbnail_url AS thumbnail_url
    FROM public.assigned_program_exercises ape
    JOIN public.exercises e ON e.id = ape.exercise_id
    WHERE ape.deleted_at IS NULL
      AND (CASE WHEN EXISTS (SELECT 1 FROM public.assigned_program_exercises z
                             WHERE z.session_log_id = p_session_id)
                THEN ape.session_log_id = p_session_id
                ELSE ape.day_id = v_day_id END)
  ),
  done AS (
    SELECT exercise_id AS ape_id, count(*) AS done_count
    FROM public.set_logs
    WHERE session_log_id = p_session_id AND done = true
    GROUP BY exercise_id
  ),
  merged AS (
    SELECT p.*, COALESCE(d.done_count, 0)::int AS done_count
    FROM plan p
    LEFT JOIN done d ON d.ape_id = p.ape_id
  )
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'ape_id', m.ape_id,
        'superset_group', m.superset_group,
        'kg_po_ruci', m.kg_po_ruci,
        'exercise_idx', m.exercise_idx,
        'position', m.position,
        'sets', m.sets,
        'rest_seconds', m.rest_seconds,
        'reps_text', m.reps_text,
        'planned_reps', m.planned_reps,
        'planned_weight', m.planned_weight,
        'duration_minutes', m.duration_minutes,
        'is_duration_based', m.is_duration_based,
        'exercise_name', m.exercise_name,
        -- Slika vezbe za sat (ista koju telefon crta u spisku vezbi).
        'thumbnail_url', m.thumbnail_url,
        'done_count', m.done_count,
        'set_details', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'set_number', aps.set_number,
            'reps', aps.reps,
            'weight_kg', aps.weight_kg,
            'rest_seconds', aps.rest_seconds
          ) ORDER BY aps.set_number)
          FROM public.assigned_program_exercise_sets aps
          WHERE aps.assigned_exercise_id = m.ape_id
        ), '[]'::jsonb)
      ) ORDER BY m.position
    ),
    bool_and(m.done_count >= m.sets)
  INTO v_exercises, v_all_done
  FROM merged m;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'day_id', v_day_id,
    'server_now_ms', (extract(epoch FROM now()) * 1000)::bigint,
    'complete', COALESCE(v_all_done, true),
    'exercises', COALESCE(v_exercises, '[]'::jsonb)
  );
END $function$;

-- "Prosli put": nova kolona kg_po_ruci (sa serija tog treninga) i kg_po_ruci na
-- svakoj seriji. Menja se oblik reda, pa funkcija mora iznova (DROP + CREATE).
-- Kilaze ostaju po ruci, kao i rekordi.
DROP FUNCTION IF EXISTS public.get_last_exercise_performance(uuid, uuid[]);
CREATE OR REPLACE FUNCTION public.get_last_exercise_performance(p_athlete_id uuid, p_exercise_ids uuid[])
 RETURNS TABLE(exercise_id uuid, performed_at timestamp with time zone, sets jsonb, top_weight_kg numeric, best_weight_kg numeric, kg_po_ruci boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Niste prijavljeni';
  END IF;

  -- Sam vezbac, njegov trener, ili admin. Bez ovoga bi SECURITY DEFINER pustio
  -- bilo koga da procita tudju istoriju treninga.
  IF auth.uid() <> p_athlete_id
     AND NOT public.is_my_athlete(auth.uid(), p_athlete_id)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Nemate pristup ovom vezbacu';
  END IF;

  RETURN QUERY
  WITH trazene AS (
    SELECT DISTINCT unnest(p_exercise_ids) AS ex_id
  ),
  istorija AS (
    SELECT ape.exercise_id                          AS ex_id,
           w.id                                     AS session_id,
           COALESCE(w.completed_at, w.started_at)   AS kada,
           sl.set_number,
           sl.reps,
           sl.weight_kg,
           sl.kg_po_ruci                            AS po_ruci
    FROM public.set_logs sl
    JOIN public.workout_session_logs w         ON w.id = sl.session_log_id
    JOIN public.assigned_program_exercises ape ON ape.id = sl.exercise_id
    WHERE w.athlete_id = p_athlete_id
      AND w.completed_at IS NOT NULL
      AND sl.done = true
      AND ape.exercise_id = ANY(p_exercise_ids)
  ),
  poslednja AS (
    SELECT DISTINCT ON (i.ex_id) i.ex_id, i.session_id, i.kada
    FROM istorija i
    ORDER BY i.ex_id, i.kada DESC
  )
  SELECT
    t.ex_id,
    p.kada,
    COALESCE(
      (SELECT jsonb_agg(
                jsonb_build_object(
                  'set_number', i.set_number,
                  'reps',       i.reps,
                  'weight_kg',  i.weight_kg,
                  'kg_po_ruci', i.po_ruci
                ) ORDER BY i.set_number)
         FROM istorija i
        WHERE i.ex_id = t.ex_id AND i.session_id = p.session_id),
      '[]'::jsonb),
    (SELECT max(i.weight_kg)
       FROM istorija i
      WHERE i.ex_id = t.ex_id AND i.session_id = p.session_id),
    (SELECT pr.best_weight_kg
       FROM public.personal_records pr
      WHERE pr.athlete_id = p_athlete_id AND pr.exercise_id = t.ex_id),
    COALESCE(
      (SELECT bool_or(i.po_ruci)
         FROM istorija i
        WHERE i.ex_id = t.ex_id AND i.session_id = p.session_id),
      false)
  FROM trazene t
  LEFT JOIN poslednja p ON p.ex_id = t.ex_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_last_exercise_performance(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_last_exercise_performance(uuid, uuid[]) TO authenticated, service_role;

-- Cilj serije za Live Activity i trenerov sat: "2× 15 kg × 10" kad je kilaza po ruci.
CREATE OR REPLACE FUNCTION public._la_cilj_serije(p_session_id uuid, p_idx integer, p_set integer, p_rest_ends timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_day uuid;
  v_racvan boolean := false;
  v_ape_id uuid; v_ape_reps text; v_ape_kg numeric; v_ape_rest integer;
  v_trajanje integer; v_na_vreme boolean; v_po_ruci boolean;
  v_reps text; v_kg numeric; v_tip text; v_rest integer;
  v_kg_txt text;
  v_out jsonb := '{}'::jsonb;
BEGIN
  IF p_session_id IS NULL OR p_idx IS NULL OR p_idx < 0 THEN RETURN v_out; END IF;

  SELECT s.day_id INTO v_day FROM public.workout_session_logs s WHERE s.id = p_session_id;
  SELECT EXISTS (SELECT 1 FROM public.assigned_program_exercises
                 WHERE session_log_id = p_session_id) INTO v_racvan;

  -- Isti spisak i isti redosled kao get_session_plan_full: indeks vezbe u
  -- workout_live_state broji po njemu.
  SELECT ape.id, ape.reps::text, ape.weight_kg, ape.rest_seconds, ape.duration_minutes,
         COALESCE(e.is_duration_based, false), COALESCE(ape.kg_po_ruci, false)
    INTO v_ape_id, v_ape_reps, v_ape_kg, v_ape_rest, v_trajanje, v_na_vreme, v_po_ruci
  FROM public.assigned_program_exercises ape
  JOIN public.exercises e ON e.id = ape.exercise_id
  WHERE ape.deleted_at IS NULL
    AND (CASE WHEN v_racvan THEN ape.session_log_id = p_session_id
              ELSE v_day IS NOT NULL AND ape.day_id = v_day END)
  ORDER BY ape.position
  OFFSET p_idx LIMIT 1;
  IF v_ape_id IS NULL THEN RETURN v_out; END IF;

  SELECT NULLIF(btrim(aps.reps::text), ''), aps.weight_kg, aps.set_type, aps.rest_seconds
    INTO v_reps, v_kg, v_tip, v_rest
  FROM public.assigned_program_exercise_sets aps
  WHERE aps.assigned_exercise_id = v_ape_id AND aps.set_number = COALESCE(p_set, 1);
  IF NOT FOUND THEN
    v_reps := NULLIF(btrim(v_ape_reps), '');
    v_kg := v_ape_kg;
  END IF;
  v_rest := COALESCE(v_rest, v_ape_rest);

  IF v_na_vreme THEN
    v_out := jsonb_build_object('isDurationBased', true);
    IF v_trajanje IS NOT NULL THEN
      v_out := v_out || jsonb_build_object('durationMinutes', v_trajanje);
    END IF;
  ELSE
    IF v_kg IS NOT NULL AND v_kg > 0 THEN
      v_kg_txt := CASE WHEN v_kg = round(v_kg) THEN round(v_kg)::bigint::text
                       ELSE round(v_kg, 1)::text END;
      -- Kilaza po ruci: "2× 15 kg × 10".
      v_out := jsonb_build_object('weightText',
                 CASE WHEN v_po_ruci THEN '2× ' ELSE '' END
                 || v_kg_txt || ' kg × ' || COALESCE(v_reps, '-'));
    ELSIF v_reps IS NOT NULL THEN
      v_out := jsonb_build_object('weightText', v_reps || ' ponavljanja');
    END IF;
    IF v_tip IS NOT NULL AND v_tip <> '' THEN
      v_out := v_out || jsonb_build_object('tipSerije', v_tip);
    END IF;
  END IF;

  -- Pocetak pauze = kraj minus planirana pauza; traka na kartici onda pokazuje
  -- koliko je pauze ostalo, a ne krece od pune na svako osvezavanje.
  IF p_rest_ends IS NOT NULL AND v_rest IS NOT NULL AND v_rest > 0 THEN
    v_out := v_out || jsonb_build_object(
      'restStartedAt', (extract(epoch FROM p_rest_ends)::bigint - v_rest - 978307200));
  END IF;

  RETURN v_out;
END;
$function$;

-- Trener uzivo: kilaza po ruci za jednu vezbu ovog treninga (po uzoru na trainer_set_rest).
-- Ziv trening: racva plan i menja kopiju (vazi samo za danas), pa podize plan_version.
-- Zatvoren trening se NE racva (kopija bi se pravila od danasnjeg programa i promenila
-- prikaz istorije): menjaju se samo njegove serije (i kopija ako je vec postoji),
-- vezba dana (program) se ne dira, a teret se sabira ponovo.
-- U oba slucaja se menjaju i vec upisane serije te vezbe u ovom treningu.
CREATE OR REPLACE FUNCTION public.trainer_set_kg_po_ruci(p_session_id uuid, p_ape_id uuid, p_value boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_athlete uuid;
  v_ape uuid;
  v_izvor uuid;
  v_aktivan boolean;
  v_teret numeric;
BEGIN
  v_athlete := public._trainer_edit_guard(p_session_id);

  IF p_value IS NULL THEN
    RAISE EXCEPTION 'Nije izabrano da li je kilaza po ruci';
  END IF;

  SELECT s.is_active INTO v_aktivan
  FROM public.workout_session_logs s WHERE s.id = p_session_id;
  v_aktivan := COALESCE(v_aktivan, false);

  -- Izmena je izmena PLANA, pa vazi samo za danas.
  IF v_aktivan THEN
    PERFORM public._fork_session_plan(p_session_id);
  END IF;
  v_ape := public._session_plan_row(p_session_id, p_ape_id);

  -- Zatvoren trening: vezba je mozda posle uklonjena iz programa, a serije su ostale.
  IF v_ape IS NULL AND NOT v_aktivan AND EXISTS (
    SELECT 1 FROM public.set_logs sl
    WHERE sl.session_log_id = p_session_id AND sl.exercise_id = p_ape_id
  ) THEN
    v_ape := p_ape_id;
  END IF;
  IF v_ape IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u ovom treningu'; END IF;

  -- Samo kopija uz ovaj trening; vezba dana je program i ne dira se.
  UPDATE public.assigned_program_exercises
  SET kg_po_ruci = p_value
  WHERE id = v_ape AND session_log_id = p_session_id;

  SELECT ape.forked_from INTO v_izvor
  FROM public.assigned_program_exercises ape WHERE ape.id = v_ape;

  -- Vec upisane serije (i one koje jos pokazuju na vezbu dana).
  UPDATE public.set_logs
  SET kg_po_ruci = p_value
  WHERE session_log_id = p_session_id
    AND exercise_id IN (v_ape, p_ape_id, v_izvor)
    AND kg_po_ruci IS DISTINCT FROM p_value;

  IF NOT v_aktivan THEN
    -- Zatvoren trening vec ima sabran teret; sabira se ponovo, sa obe ruke.
    UPDATE public.workout_session_logs s
       SET total_volume_kg = (SELECT COALESCE(sum(reps * weight_kg * CASE WHEN kg_po_ruci THEN 2 ELSE 1 END), 0)
                                FROM public.set_logs
                               WHERE session_log_id = p_session_id AND done = true)
     WHERE s.id = p_session_id
    RETURNING s.total_volume_kg INTO v_teret;

    RETURN jsonb_build_object('success', true, 'state', 'completed',
                              'kg_po_ruci', p_value, 'total_volume_kg', v_teret);
  END IF;

  -- Podigni plan_version: to je jedini signal vezbacevom telefonu i satu.
  RETURN public._trainer_resync_live(p_session_id, v_athlete)
         || jsonb_build_object('kg_po_ruci', p_value);
END;
$function$;

REVOKE ALL ON FUNCTION public.trainer_set_kg_po_ruci(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_set_kg_po_ruci(uuid, uuid, boolean) TO authenticated, service_role;

-- Obavestenje o rekordu: "2× 15 kg × 10" kad je serija po ruci (rekord ostaje po ruci).
CREATE OR REPLACE FUNCTION public._javi_rekorde_posle_treninga()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trainer_id uuid;
  v_athlete_name text;
  v_broj int := 0;
  r record;
BEGIN
  IF NEW.completed_at IS NULL OR OLD.completed_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.entered_by_trainer IS NOT NULL THEN RETURN NEW; END IF;

  BEGIN
    SELECT a.trainer_id, COALESCE(p.full_name, 'Vežbač')
      INTO v_trainer_id, v_athlete_name
    FROM public.athletes a
    LEFT JOIN public.profiles p ON p.id = a.id
    WHERE a.id = NEW.athlete_id;

    IF v_trainer_id IS NULL OR NOT public.should_notify_trainer(v_trainer_id, 'workouts') THEN
      RETURN NEW;
    END IF;

    FOR r IN
      WITH serije AS (
        SELECT ape.exercise_id AS vezba, sl.session_log_id AS sid, sl.weight_kg AS kg, sl.reps AS pon,
               sl.kg_po_ruci AS po_ruci,
               round((sl.weight_kg * (1 + sl.reps::numeric / 30))::numeric, 2) AS e1rm
        FROM public.set_logs sl
        JOIN public.workout_session_logs s ON s.id = sl.session_log_id
        JOIN public.assigned_program_exercises ape ON ape.id = sl.exercise_id
        WHERE s.athlete_id = NEW.athlete_id
          AND s.entered_by_trainer IS NULL
          AND sl.done = true AND sl.weight_kg > 0 AND sl.reps > 0
          AND (s.id = NEW.id OR s.completed_at IS NOT NULL)
      ),
      danas AS (
        SELECT DISTINCT ON (vezba) vezba, kg, pon, po_ruci, (SELECT max(x.e1rm) FROM serije x WHERE x.sid = NEW.id AND x.vezba = serije.vezba) AS e1rm
        FROM serije WHERE sid = NEW.id
        ORDER BY vezba, kg DESC, pon DESC
      ),
      ranije AS (
        SELECT DISTINCT ON (vezba) vezba, kg, pon, (SELECT max(x.e1rm) FROM serije x WHERE x.sid <> NEW.id AND x.vezba = serije.vezba) AS e1rm
        FROM serije WHERE sid <> NEW.id
        ORDER BY vezba, kg DESC, pon DESC
      )
      SELECT d.vezba, d.kg, d.pon, d.e1rm, d.po_ruci, e.name AS ime,
             (d.kg > ra.kg OR (d.kg = ra.kg AND d.pon > ra.pon)) AS rekord_kg,
             (d.e1rm > ra.e1rm) AS rekord_e1rm
      FROM danas d
      JOIN ranije ra ON ra.vezba = d.vezba
      LEFT JOIN public.exercises e ON e.id = d.vezba
      WHERE d.kg > ra.kg OR (d.kg = ra.kg AND d.pon > ra.pon) OR d.e1rm > ra.e1rm
      ORDER BY (d.e1rm - ra.e1rm) DESC
      LIMIT 3
    LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.recipient_id = v_trainer_id AND n.kind = 'pr_set'
          AND n.meta ->> 'session_log_id' = NEW.id::text
          AND n.meta ->> 'exercise_id' = r.vezba::text);

      INSERT INTO public.notifications (
        recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta
      ) VALUES (
        v_trainer_id, 'trainer', NEW.athlete_id, NEW.athlete_id, 'pr_set',
        v_athlete_name || ' oborio rekord 🏆',
        COALESCE(r.ime, 'Vežba') || ' • ' ||
          CASE WHEN r.po_ruci THEN '2× ' ELSE '' END ||
          trim(trailing '.' from trim(trailing '0' from r.kg::text)) || ' kg × ' || r.pon::text ||
          CASE WHEN r.rekord_e1rm
               THEN ' (1RM ~' || trim(trailing '.' from trim(trailing '0' from r.e1rm::text)) || ' kg)'
               ELSE '' END,
        jsonb_build_object(
          'exercise_id', r.vezba, 'exercise_name', r.ime,
          'weight_kg', r.kg, 'reps', r.pon, 'e1rm_kg', r.e1rm,
          'is_weight_pr', r.rekord_kg, 'is_volume_pr', false, 'is_e1rm_pr', r.rekord_e1rm,
          'kg_po_ruci', COALESCE(r.po_ruci, false),
          'session_log_id', NEW.id));
      v_broj := v_broj + 1;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- Obavestenje o rekordu ne sme da obori zavrsetak treninga.
    NULL;
  END;
  RETURN NEW;
END;
$function$;

-- Ispravljeno obavestenje o rekordu zadrzava "2× " kad je serija po ruci.
CREATE OR REPLACE FUNCTION public._set_logs_pr_ispravka()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_athlete_id  uuid;
  v_exercise_id uuid;
  v_pr          public.personal_records%ROWTYPE;
  v_kg          boolean;
  v_vol         boolean;
  v_e1rm        boolean;
  v_novi        public.personal_records%ROWTYPE;
BEGIN
  -- Stara vrednost nije ni mogla da bude rekord.
  IF OLD.done IS NOT TRUE OR COALESCE(OLD.weight_kg, 0) <= 0 OR COALESCE(OLD.reps, 0) <= 0 THEN
    RETURN NULL;
  END IF;
  -- Serija je podignuta ili ista: to resava update_personal_record.
  IF TG_OP = 'UPDATE' AND NEW.done IS TRUE
     AND COALESCE(NEW.weight_kg, 0) >= OLD.weight_kg AND COALESCE(NEW.reps, 0) >= OLD.reps THEN
    RETURN NULL;
  END IF;

  -- Kad sesija nestaje zajedno sa nalogom (kaskada), nema ni vlasnika ni rekorda.
  SELECT s.athlete_id, ape.exercise_id
    INTO v_athlete_id, v_exercise_id
  FROM public.workout_session_logs s
  JOIN public.assigned_program_exercises ape ON ape.id = OLD.exercise_id
  WHERE s.id = OLD.session_log_id;
  IF v_athlete_id IS NULL OR v_exercise_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_pr FROM public.personal_records
   WHERE athlete_id = v_athlete_id AND exercise_id = v_exercise_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Racuna se ponovo samo ako je bas ova serija drzala rekord. Tako stari rekord,
  -- ciji izvor vise ne postoji u set_logs, ne moze slucajno da padne.
  v_kg   := COALESCE(OLD.weight_kg = v_pr.best_weight_kg AND OLD.reps = v_pr.best_weight_reps, false);
  v_vol  := COALESCE(round((OLD.weight_kg * OLD.reps)::numeric, 2) = v_pr.best_volume_kg, false);
  v_e1rm := COALESCE(round((OLD.weight_kg * (1 + OLD.reps::numeric / 30))::numeric, 2) = v_pr.best_e1rm_kg, false);
  IF NOT (v_kg OR v_vol OR v_e1rm) THEN RETURN NULL; END IF;

  PERFORM public._recompute_personal_record(v_athlete_id, v_exercise_id, v_kg, v_vol, v_e1rm);

  -- Treneru je vec otislo "oborio rekord" sa pogresnom brojkom. Ako rekord u kilazi
  -- vise ne pripada ovom treningu, obavestenje je netacno i sklanja se; ako i dalje
  -- pripada, dobija ispravljenu brojku. Ne sme da obori ispravku serije.
  BEGIN
    SELECT * INTO v_novi FROM public.personal_records
     WHERE athlete_id = v_athlete_id AND exercise_id = v_exercise_id;

    IF v_novi.id IS NULL OR v_novi.best_weight_session_log_id IS DISTINCT FROM OLD.session_log_id THEN
      DELETE FROM public.notifications n
       WHERE n.kind = 'pr_set'
         AND n.athlete_id = v_athlete_id
         AND n.meta ->> 'session_log_id' = OLD.session_log_id::text
         AND n.meta ->> 'exercise_id' = v_exercise_id::text;
    ELSE
      -- Ista vezba u istom treningu: oznaka po ruci je ista kao na ovoj seriji.
      UPDATE public.notifications n
      SET body = COALESCE(n.meta ->> 'exercise_name', 'Vežba') || ' • ' ||
                 CASE WHEN OLD.kg_po_ruci THEN '2× ' ELSE '' END ||
                 trim(trailing '.' from trim(trailing '0' from v_novi.best_weight_kg::text)) ||
                 ' kg × ' || v_novi.best_weight_reps::text,
          meta = n.meta || jsonb_build_object(
                   'weight_kg', v_novi.best_weight_kg,
                   'reps',      v_novi.best_weight_reps,
                   'e1rm_kg',   v_novi.best_e1rm_kg)
       WHERE n.kind = 'pr_set'
         AND n.athlete_id = v_athlete_id
         AND n.meta ->> 'session_log_id' = OLD.session_log_id::text
         AND n.meta ->> 'exercise_id' = v_exercise_id::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NULL;
END;
$function$;
