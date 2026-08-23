-- SUPERSET, prvi sloj: sema i motor pozicije.
--
-- Sema je jedna nullable kolona po tabeli, bez default vrednosti i bez backfila.
-- NULL znaci "obicna vezba"; vezbe sa istim brojem unutar istog dana (ili iste
-- sesije) cine jedan krug.
ALTER TABLE public.program_template_exercises
  ADD COLUMN IF NOT EXISTS superset_group smallint;
ALTER TABLE public.assigned_program_exercises
  ADD COLUMN IF NOT EXISTS superset_group smallint;

COMMENT ON COLUMN public.assigned_program_exercises.superset_group IS
  'NULL = obicna vezba. Isti broj unutar istog dana/sesije = jedan superset krug.';

-- Motor pozicije prelazi sa "vezba po vezba" na "korak po korak".
--
-- Do sada: uzmi prvu vezbu po position kojoj nesto fali, pa njenu prvu rupu.
-- To je EXERCISE-MAJOR i podnosi samo linearan trening. Superset trazi
-- A1, B1, A2, B2 - dakle STEP-MAJOR: blok, pa krug, pa mesto u bloku.
--
-- KLJUCNO SVOJSTVO: bez ijednog superseta rezultat je BIT PO BIT isti kao pre.
-- Vezba bez grupe pravi blok sam za sebe (kljuc -position, uvek negativan pa se
-- ne moze sudariti sa pravom grupom), a jednoclani blok sortiran po
-- (blok, krug, position) daje bas serije redom - tacno stara racunica.
-- Provereno nad SVIH 456 sesija u bazi: nula razlika u vezbi i u seriji.
CREATE OR REPLACE FUNCTION public.watch_compute_position(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_day_id uuid;
  v_racvan boolean;
  v_row record;
  v_per_set_rest int;
  v_rest int;
BEGIN
  SELECT day_id INTO v_day_id FROM public.workout_session_logs WHERE id = p_session_id;

  SELECT EXISTS (SELECT 1 FROM public.assigned_program_exercises
                 WHERE session_log_id = p_session_id) INTO v_racvan;

  IF v_day_id IS NULL AND NOT v_racvan THEN
    RETURN jsonb_build_object('complete', true, 'error', 'no_session');
  END IF;

  WITH plan AS (
    SELECT ape.id AS ape_id,
           ape.position,
           ape.superset_group,
           -- Indeks vezbe u NIZU koji klijent crta: ostaje po position, nezavisno
           -- od redosleda koraka. Klijent i dalje gadja isti element niza.
           (row_number() OVER (ORDER BY ape.position) - 1)::int AS exercise_idx,
           ape.sets,
           COALESCE(ape.rest_seconds, 60) AS rest_seconds,
           CASE WHEN ape.reps ~ '^[0-9]+$' THEN ape.reps::int ELSE NULL END AS planned_reps,
           ape.weight_kg AS planned_weight,
           ape.duration_minutes AS planned_duration_minutes,
           COALESCE(e.is_duration_based, false) AS is_duration_based,
           COALESCE(e.name_en, e.name) AS exercise_name
    FROM public.assigned_program_exercises ape
    JOIN public.exercises e ON e.id = ape.exercise_id
    WHERE ape.deleted_at IS NULL
      AND (CASE WHEN v_racvan THEN ape.session_log_id = p_session_id
                ELSE ape.day_id = v_day_id END)
  ),
  blok AS (
    -- Vezba bez grupe je sama svoj blok. -position je uvek negativan, pa ne moze
    -- da se sudari sa stvarnom grupom (koje su pozitivne).
    SELECT p.*, COALESCE(p.superset_group::int, -p.position) AS blok_kljuc FROM plan p
  ),
  blok_red AS (
    SELECT b.blok_kljuc, min(b.position) AS blok_poz FROM blok b GROUP BY b.blok_kljuc
  ),
  koraci AS (
    SELECT b.*, br.blok_poz, n AS krug,
           -- Koliko clanova blok ima u OVOM krugu; treba za pauzu (poslednji clan
           -- kruga dobija pravu pauzu, ostali nulu).
           count(*) OVER (PARTITION BY b.blok_kljuc, n) AS clanova_u_krugu,
           row_number() OVER (PARTITION BY b.blok_kljuc, n ORDER BY b.position) AS mesto_u_krugu
    FROM blok b
    JOIN blok_red br ON br.blok_kljuc = b.blok_kljuc
    CROSS JOIN LATERAL generate_series(1, b.sets) AS n
  ),
  poredak AS (
    SELECT k.*, row_number() OVER (ORDER BY k.blok_poz, k.krug, k.position) AS korak
    FROM koraci k
  )
  SELECT * INTO v_row
  FROM poredak p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.set_logs sl
    WHERE sl.session_log_id = p_session_id
      AND sl.exercise_id = p.ape_id
      AND sl.set_number = p.krug
      AND sl.done = true
  )
  ORDER BY p.korak
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('complete', true);
  END IF;

  SELECT aps.rest_seconds INTO v_per_set_rest
  FROM public.assigned_program_exercise_sets aps
  WHERE aps.assigned_exercise_id = v_row.ape_id
    AND aps.set_number = v_row.krug;

  v_rest := COALESCE(v_per_set_rest, v_row.rest_seconds);

  -- Unutar kruga se ne odmara: pauza ide tek posle POSLEDNJEG clana kruga.
  -- Za obicnu vezbu je clanova_u_krugu = 1, pa je ovo uvek poslednji clan i
  -- pauza ostaje netaknuta.
  IF v_row.mesto_u_krugu < v_row.clanova_u_krugu THEN
    v_rest := 0;
  END IF;

  RETURN jsonb_build_object(
    'complete', false,
    'ape_id', v_row.ape_id,
    'exercise_idx', v_row.exercise_idx,
    'set_number', v_row.krug,
    'total_sets', v_row.sets,
    'rest_seconds', v_rest,
    'exercise_name', v_row.exercise_name,
    'planned_reps', v_row.planned_reps,
    'planned_weight', v_row.planned_weight,
    'planned_duration_minutes', v_row.planned_duration_minutes,
    'is_duration_based', v_row.is_duration_based,
    'superset_group', v_row.superset_group,
    'superset_step', v_row.mesto_u_krugu,
    'superset_size', v_row.clanova_u_krugu
  );
END;
$$;
