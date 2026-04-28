-- ============================================================
-- 25_pr_tracking_and_streaks.sql
--
-- 1) personal_records  — najbolji rezultat po (athlete, exercise)
--    - best_weight_kg / best_reps_at_weight   → "single rep PR" (max kg)
--    - best_volume_set (kg × reps)            → "set volume PR"
--    - best_estimated_1rm (Epley)             → fer poređenje kroz reps
-- 2) Trigger na set_logs.done = true:
--    - upsert PR red ako je novi rekord
--    - vrati u JSONB šta je tačno bio PR (za UI badge)
-- 3) Notifikacija treneru (workouts grupa) kad je PR
-- 4) RPC get_athlete_streak(p_athlete_id)
--    - current_streak_days  → uzastopni dani sa završenim treningom
--    - longest_streak_days
--    - weeks_streak         → uzastopne nedelje sa ≥1 treningom
--    - total_workouts
--    - last_workout_at
-- ============================================================

-- ----------- 1) tabela ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personal_records (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id           uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,

  -- max kg podignut u jednom setu (i na koliko reps)
  best_weight_kg        numeric(6,2),
  best_weight_reps      int,
  best_weight_at        timestamptz,
  best_weight_session_log_id uuid REFERENCES public.workout_session_logs(id) ON DELETE SET NULL,

  -- max volume u jednom setu (kg * reps)
  best_volume_kg        numeric(8,2),
  best_volume_weight_kg numeric(6,2),
  best_volume_reps      int,
  best_volume_at        timestamptz,

  -- max procenjeni 1RM (Epley): w * (1 + r/30)
  best_e1rm_kg          numeric(6,2),
  best_e1rm_weight_kg   numeric(6,2),
  best_e1rm_reps        int,
  best_e1rm_at          timestamptz,

  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_pr_athlete ON public.personal_records(athlete_id);
CREATE INDEX IF NOT EXISTS idx_pr_exercise ON public.personal_records(exercise_id);
CREATE INDEX IF NOT EXISTS idx_pr_e1rm ON public.personal_records(athlete_id, best_e1rm_at DESC);

-- ----------- RLS ------------------------------------------------------
ALTER TABLE public.personal_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "athlete reads own PRs" ON public.personal_records;
CREATE POLICY "athlete reads own PRs"
  ON public.personal_records FOR SELECT
  USING (athlete_id = auth.uid());

DROP POLICY IF EXISTS "trainer reads athlete PRs" ON public.personal_records;
CREATE POLICY "trainer reads athlete PRs"
  ON public.personal_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.id = personal_records.athlete_id
        AND a.trainer_id = auth.uid()
    )
  );

-- INSERT/UPDATE rade SAMO trigger funkcije (SECURITY DEFINER), ne klijent.

-- ----------- 2) trigger funkcija --------------------------------------
CREATE OR REPLACE FUNCTION public.update_personal_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_athlete_id  uuid;
  v_exercise_id uuid;
  v_volume      numeric(8,2);
  v_e1rm        numeric(6,2);
  v_pr          public.personal_records%ROWTYPE;
  v_is_new_weight boolean := false;
  v_is_new_volume boolean := false;
  v_is_new_e1rm   boolean := false;
  v_trainer_id  uuid;
  v_athlete_name text;
  v_exercise_name text;
BEGIN
  -- samo kad je set označen kao završen i ima validne brojeve
  IF NEW.done IS NOT TRUE THEN RETURN NEW; END IF;
  IF NEW.weight_kg IS NULL OR NEW.weight_kg <= 0 THEN RETURN NEW; END IF;
  IF NEW.reps IS NULL OR NEW.reps <= 0 THEN RETURN NEW; END IF;

  -- vlasnika seta i pravu vežbu (kroz snapshot u assigned_program_exercises)
  SELECT s.athlete_id, ape.exercise_id
    INTO v_athlete_id, v_exercise_id
  FROM public.workout_session_logs s
  JOIN public.assigned_program_exercises ape ON ape.id = NEW.exercise_id
  WHERE s.id = NEW.session_log_id;

  IF v_athlete_id IS NULL OR v_exercise_id IS NULL THEN RETURN NEW; END IF;

  v_volume := NEW.weight_kg * NEW.reps;
  v_e1rm   := ROUND((NEW.weight_kg * (1 + NEW.reps::numeric / 30))::numeric, 2);

  -- postojeći red (ako ga ima)
  SELECT * INTO v_pr
  FROM public.personal_records
  WHERE athlete_id = v_athlete_id AND exercise_id = v_exercise_id;

  IF NOT FOUND THEN
    -- prvi put — sve je PR
    INSERT INTO public.personal_records (
      athlete_id, exercise_id,
      best_weight_kg, best_weight_reps, best_weight_at, best_weight_session_log_id,
      best_volume_kg, best_volume_weight_kg, best_volume_reps, best_volume_at,
      best_e1rm_kg, best_e1rm_weight_kg, best_e1rm_reps, best_e1rm_at,
      updated_at
    ) VALUES (
      v_athlete_id, v_exercise_id,
      NEW.weight_kg, NEW.reps, now(), NEW.session_log_id,
      v_volume, NEW.weight_kg, NEW.reps, now(),
      v_e1rm, NEW.weight_kg, NEW.reps, now(),
      now()
    );
    v_is_new_weight := true;
    v_is_new_volume := true;
    v_is_new_e1rm   := true;
  ELSE
    -- max weight (strogo veće, ili isti weight ali više reps)
    IF NEW.weight_kg > COALESCE(v_pr.best_weight_kg, 0)
       OR (NEW.weight_kg = v_pr.best_weight_kg AND NEW.reps > COALESCE(v_pr.best_weight_reps, 0)) THEN
      v_is_new_weight := true;
    END IF;

    IF v_volume > COALESCE(v_pr.best_volume_kg, 0) THEN
      v_is_new_volume := true;
    END IF;

    IF v_e1rm > COALESCE(v_pr.best_e1rm_kg, 0) THEN
      v_is_new_e1rm := true;
    END IF;

    IF v_is_new_weight OR v_is_new_volume OR v_is_new_e1rm THEN
      UPDATE public.personal_records SET
        best_weight_kg            = CASE WHEN v_is_new_weight THEN NEW.weight_kg ELSE best_weight_kg END,
        best_weight_reps          = CASE WHEN v_is_new_weight THEN NEW.reps ELSE best_weight_reps END,
        best_weight_at            = CASE WHEN v_is_new_weight THEN now() ELSE best_weight_at END,
        best_weight_session_log_id= CASE WHEN v_is_new_weight THEN NEW.session_log_id ELSE best_weight_session_log_id END,

        best_volume_kg            = CASE WHEN v_is_new_volume THEN v_volume ELSE best_volume_kg END,
        best_volume_weight_kg     = CASE WHEN v_is_new_volume THEN NEW.weight_kg ELSE best_volume_weight_kg END,
        best_volume_reps          = CASE WHEN v_is_new_volume THEN NEW.reps ELSE best_volume_reps END,
        best_volume_at            = CASE WHEN v_is_new_volume THEN now() ELSE best_volume_at END,

        best_e1rm_kg              = CASE WHEN v_is_new_e1rm THEN v_e1rm ELSE best_e1rm_kg END,
        best_e1rm_weight_kg       = CASE WHEN v_is_new_e1rm THEN NEW.weight_kg ELSE best_e1rm_weight_kg END,
        best_e1rm_reps            = CASE WHEN v_is_new_e1rm THEN NEW.reps ELSE best_e1rm_reps END,
        best_e1rm_at              = CASE WHEN v_is_new_e1rm THEN now() ELSE best_e1rm_at END,

        updated_at                = now()
      WHERE athlete_id = v_athlete_id AND exercise_id = v_exercise_id;
    END IF;
  END IF;

  -- notifikacija treneru (samo ako je bilo ŠTA PR i grupa workouts ON)
  IF v_is_new_weight OR v_is_new_e1rm THEN
    SELECT a.trainer_id, COALESCE(p.full_name, 'Vežbač'), e.name
      INTO v_trainer_id, v_athlete_name, v_exercise_name
    FROM public.athletes a
    LEFT JOIN public.profiles p ON p.id = a.id
    LEFT JOIN public.exercises e ON e.id = v_exercise_id
    WHERE a.id = v_athlete_id;

    IF v_trainer_id IS NOT NULL
       AND public.should_notify_trainer(v_trainer_id, 'workouts') THEN
      INSERT INTO public.notifications (
        recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta
      ) VALUES (
        v_trainer_id, 'trainer', v_athlete_id, v_athlete_id, 'pr_set',
        v_athlete_name || ' oborio rekord 🏆',
        COALESCE(v_exercise_name, 'Vežba') || ' • ' ||
          NEW.weight_kg::text || ' kg × ' || NEW.reps::text ||
          CASE WHEN v_is_new_e1rm THEN ' (1RM ~' || v_e1rm::text || ' kg)' ELSE '' END,
        jsonb_build_object(
          'exercise_id',   v_exercise_id,
          'exercise_name', v_exercise_name,
          'weight_kg',     NEW.weight_kg,
          'reps',          NEW.reps,
          'e1rm_kg',       v_e1rm,
          'is_weight_pr',  v_is_new_weight,
          'is_volume_pr',  v_is_new_volume,
          'is_e1rm_pr',    v_is_new_e1rm,
          'session_log_id', NEW.session_log_id
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_logs_pr ON public.set_logs;
CREATE TRIGGER trg_set_logs_pr
  AFTER INSERT OR UPDATE OF done, weight_kg, reps ON public.set_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_personal_record();

-- ----------- 3) RPC za UI: da li je upravo upisan set bio PR ----------
-- Vraća JSON sa kojim PR-ovima je set ušao, da vežbaču pokažemo badge odmah.
CREATE OR REPLACE FUNCTION public.check_set_pr(p_set_log_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_athlete_id uuid;
  v_exercise_id uuid;
  v_weight numeric;
  v_reps int;
  v_e1rm numeric;
  v_pr public.personal_records%ROWTYPE;
BEGIN
  SELECT s.athlete_id, ape.exercise_id, sl.weight_kg, sl.reps
    INTO v_athlete_id, v_exercise_id, v_weight, v_reps
  FROM public.set_logs sl
  JOIN public.workout_session_logs s ON s.id = sl.session_log_id
  JOIN public.assigned_program_exercises ape ON ape.id = sl.exercise_id
  WHERE sl.id = p_set_log_id;

  IF v_athlete_id IS NULL OR v_athlete_id <> auth.uid() THEN
    RETURN jsonb_build_object('is_pr', false);
  END IF;

  IF v_weight IS NULL OR v_weight <= 0 OR v_reps IS NULL OR v_reps <= 0 THEN
    RETURN jsonb_build_object('is_pr', false);
  END IF;

  SELECT * INTO v_pr FROM public.personal_records
  WHERE athlete_id = v_athlete_id AND exercise_id = v_exercise_id;

  v_e1rm := ROUND((v_weight * (1 + v_reps::numeric / 30))::numeric, 2);

  RETURN jsonb_build_object(
    'is_pr', (v_pr.best_weight_kg = v_weight AND v_pr.best_weight_reps = v_reps)
             OR v_pr.best_e1rm_kg = v_e1rm,
    'is_weight_pr', v_pr.best_weight_kg = v_weight AND v_pr.best_weight_reps = v_reps,
    'is_e1rm_pr',   v_pr.best_e1rm_kg = v_e1rm,
    'weight_kg',    v_weight,
    'reps',         v_reps,
    'e1rm_kg',      v_e1rm
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_set_pr(uuid) TO authenticated;

-- ----------- 4) Streak RPC --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_athlete_streak(p_athlete_id uuid)
RETURNS TABLE (
  current_streak_days  int,
  longest_streak_days  int,
  weeks_streak         int,
  total_workouts       int,
  last_workout_at      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Belgrade')::date;
  v_current int := 0;
  v_longest int := 0;
  v_run int := 0;
  v_prev date := NULL;
  v_total int := 0;
  v_last timestamptz;
  v_weeks int := 0;
  v_prev_week date := NULL;
  r record;
BEGIN
  -- jedinstveni dani treninga (lokalni datum BG)
  FOR r IN
    SELECT DISTINCT (completed_at AT TIME ZONE 'Europe/Belgrade')::date AS d
    FROM public.workout_session_logs
    WHERE athlete_id = p_athlete_id
      AND completed_at IS NOT NULL
    ORDER BY d
  LOOP
    v_total := v_total + 1;
    IF v_prev IS NULL OR r.d - v_prev = 1 THEN
      v_run := v_run + 1;
    ELSIF r.d = v_prev THEN
      -- isti dan (ne bi trebalo zbog DISTINCT, ali safe)
      NULL;
    ELSE
      v_run := 1;
    END IF;
    IF v_run > v_longest THEN v_longest := v_run; END IF;
    v_prev := r.d;
  END LOOP;

  -- current streak: računa od danas ili juče (gap od max 1 dan dozvoljen)
  IF v_prev IS NOT NULL AND (v_today - v_prev) <= 1 THEN
    v_current := v_run;
  ELSE
    v_current := 0;
  END IF;

  -- weeks streak: uzastopne ISO nedelje sa ≥1 treningom, do ove nedelje (ili prošle)
  v_run := 0;
  FOR r IN
    SELECT DISTINCT date_trunc('week', completed_at AT TIME ZONE 'Europe/Belgrade')::date AS w
    FROM public.workout_session_logs
    WHERE athlete_id = p_athlete_id
      AND completed_at IS NOT NULL
    ORDER BY w
  LOOP
    IF v_prev_week IS NULL OR r.w - v_prev_week = 7 THEN
      v_run := v_run + 1;
    ELSE
      v_run := 1;
    END IF;
    v_prev_week := r.w;
  END LOOP;

  IF v_prev_week IS NOT NULL
     AND (date_trunc('week', v_today)::date - v_prev_week) <= 7 THEN
    v_weeks := v_run;
  ELSE
    v_weeks := 0;
  END IF;

  SELECT MAX(completed_at) INTO v_last
  FROM public.workout_session_logs
  WHERE athlete_id = p_athlete_id AND completed_at IS NOT NULL;

  RETURN QUERY SELECT v_current, v_longest, v_weeks, v_total, v_last;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_athlete_streak(uuid) TO authenticated;
