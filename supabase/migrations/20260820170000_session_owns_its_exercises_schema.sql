-- Trening dobija SVOJ spisak vezbi, da izmena usred treninga vazi samo za danas.
--
-- Do sada su trainer_replace_exercise / add / remove pisali u vezbe DANA, a dan
-- se ponavlja: 26 dana je radjeno vise puta, na njima 297 od 311 treninga sa
-- planom, jedan dan cak 82 puta. Zamena "benc je zauzet" tako je trajno menjala
-- program za svih 82 sledecih puta.
--
-- Kopije zive u istoj tabeli (set_logs.exercise_id ima tvrd strani kljuc bas na
-- nju, pa druga tabela nije opcija), ali sa day_id = NULL i session_log_id
-- postavljenim. Time svaki postojeci upit "WHERE day_id = X" - a takvih je 11 u
-- funkcijama i klijentu - kopije NE vidi, bez ijedne izmene. Sablon ostaje
-- iskljucivo ono sto ima day_id.
ALTER TABLE public.assigned_program_exercises
  ALTER COLUMN day_id DROP NOT NULL;

ALTER TABLE public.assigned_program_exercises
  ADD COLUMN IF NOT EXISTS session_log_id uuid
    REFERENCES public.workout_session_logs(id) ON DELETE CASCADE;

-- Red je ili sablonski (dan) ili treninga (sesija) - nikad oboje, nikad nijedno.
-- Ovim NOT NULL na day_id nije olabavljen nego premesten u tacniji oblik.
ALTER TABLE public.assigned_program_exercises
  DROP CONSTRAINT IF EXISTS ape_dan_ili_sesija;
ALTER TABLE public.assigned_program_exercises
  ADD CONSTRAINT ape_dan_ili_sesija CHECK (num_nonnulls(day_id, session_log_id) = 1);

CREATE INDEX IF NOT EXISTS ape_session_log_id_idx
  ON public.assigned_program_exercises (session_log_id, position)
  WHERE session_log_id IS NOT NULL;

-- Postojeca RLS politika vlasnistvo vuce kroz day_id -> dan -> program. Kopije
-- nemaju day_id, pa im treba sopstvena grana: vlasnik je trener ili vezbac tog
-- treninga. Pretplatne (can_trainer_write) politike ostaju netaknute i i dalje
-- vaze i za ove redove. Upis je samo trenerov - vezbac svoje brojeve upisuje
-- kroz set_logs, ne kroz plan.
DROP POLICY IF EXISTS "Pristup vezbama treninga" ON public.assigned_program_exercises;
CREATE POLICY "Pristup vezbama treninga" ON public.assigned_program_exercises
FOR ALL
USING (
  session_log_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workout_session_logs s
    WHERE s.id = assigned_program_exercises.session_log_id
      AND (s.athlete_id = auth.uid() OR public.is_my_athlete(auth.uid(), s.athlete_id))
  )
)
WITH CHECK (
  session_log_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workout_session_logs s
    WHERE s.id = assigned_program_exercises.session_log_id
      AND public.is_my_athlete(auth.uid(), s.athlete_id)
  )
);
