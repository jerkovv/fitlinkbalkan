-- Obrisan dan programa vezbaca ostaje u tabeli (deleted_at) i drzao je svoj broj dana,
-- pa je posle brisanja poslednjeg dana svako dodavanje novog dana padalo sa 23505.
-- Jedinstvenost broja dana zato vazi samo medju zivim danima.
-- Nijedna funkcija ne koristi ON CONFLICT nad ovim ogranicenjem niti trazi dan po broju
-- bez deleted_at IS NULL (provereno: jedino get_next_workout_day, koji filtrira).
ALTER TABLE public.assigned_program_days
  DROP CONSTRAINT IF EXISTS assigned_program_days_assigned_program_id_day_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS assigned_program_days_program_broj_zivi
  ON public.assigned_program_days (assigned_program_id, day_number)
  WHERE deleted_at IS NULL;
