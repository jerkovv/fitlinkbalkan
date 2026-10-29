-- Vezbe koje je trener sam napravio (is_global = false) vezbac nije mogao da procita, pa
-- je na pocetnoj kartica dana ostajala bez slike, a rekord bez imena ("Vezba").
-- Dodaje se jos jedna SELECT politika; postojece tri (globalne, svoje, admin) ostaju,
-- a permisivne politike se sabiraju, pa se nikome nista ne oduzima.
DROP POLICY IF EXISTS "Vezbac vidi vezbe svog trenera" ON public.exercises;
CREATE POLICY "Vezbac vidi vezbe svog trenera" ON public.exercises
  FOR SELECT TO authenticated
  USING (created_by IS NOT NULL AND public.is_my_athlete(created_by, auth.uid()));
