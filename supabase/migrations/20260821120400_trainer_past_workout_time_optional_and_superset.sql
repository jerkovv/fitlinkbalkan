-- Upis treninga bez telefona: vreme vise nije trenerov posao, a superset jeste.
--
-- 1) VREME I TRAJANJE POSTAJU OPCIONI. Trener zapisuje STA je vezbac radio, ne
-- kad i koliko - to su bila dva polja koja mora da popuni pre nego sto dodje do
-- jedine stvari koja ga zanima. Bez njih: pocetak je trenutak upisa, a trajanje
-- ostaje NULL (prazno) umesto izmisljenih 60 minuta.
--
-- Zastita od duplog slanja se zato vezuje samo za slucaj kad je vreme IZRICITO
-- poslato. Kad ga racuna server, dva upisa u istom minutu su normalna stvar
-- (trener upisuje dva propustena treninga zaredom), pa bi brana lagala.
--
-- 2) SUPERSET. Trener bira koje vezbe cine krug, isto kao u planu i uzivo.
-- Ovde je opis, ne motor - trening je vec odradjen - ali mora da prezivi do
-- prikaza, inace se u istoriji ne vidi da su dve vezbe isle zajedno.
CREATE OR REPLACE FUNCTION public.trainer_create_past_workout(
  p_athlete_id uuid,
  p_started_at timestamp with time zone DEFAULT NULL::timestamptz,
  p_duration_minutes integer DEFAULT NULL::integer,
  p_exercises jsonb DEFAULT NULL::jsonb,
  p_title text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text)
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
    INSERT INTO public.assigned_program_exercises
      (session_log_id, exercise_id, position, sets, reps, rest_seconds,
       duration_minutes, superset_group)
    VALUES
      (v_session, (v_vezba->>'exercise_id')::uuid, v_poz,
       jsonb_array_length(v_vezba->'sets'), v_reps,
       COALESCE((v_vezba->>'rest_seconds')::int, 90),
       CASE WHEN v_kardio THEN v_min END,
       NULLIF(v_vezba->>'superset_group', '')::smallint)
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

  UPDATE public.workout_session_logs
  SET total_volume_kg = (
    SELECT COALESCE(sum(COALESCE(reps,0) * COALESCE(weight_kg,0)), 0)
    FROM public.set_logs WHERE session_log_id = v_session AND done = true
  )
  WHERE id = v_session;

  RETURN v_session;
END;
$function$;

REVOKE ALL ON FUNCTION public.trainer_create_past_workout(uuid, timestamptz, integer, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_create_past_workout(uuid, timestamptz, integer, jsonb, text, text) TO authenticated;

-- Detalj treninga mora da vrati superset_group, inace se krug nigde ne vidi.
DO $mig$
DECLARE v_src text; v_new text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_inapp_workout_detail';

  v_new := replace(v_src,
'        ''exercise_name'', COALESCE(e.name, ''Vezba''),',
'        ''exercise_name'', COALESCE(e.name, ''Vezba''),
        ''superset_group'', ape.superset_group,');
  IF v_new = v_src THEN
    RAISE EXCEPTION 'get_inapp_workout_detail: obrazac exercise_name nije nadjen';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.get_inapp_workout_detail(p_session_id uuid)
     RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''public'' AS %L',
    v_new);
END $mig$;
