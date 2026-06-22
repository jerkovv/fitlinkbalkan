-- kardio (is_duration_based) uvek ima tacno 1 set, bez obzira ko upisuje red
CREATE OR REPLACE FUNCTION public.enforce_cardio_single_set()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.exercises e
    WHERE e.id = NEW.exercise_id AND e.is_duration_based = true
  ) THEN
    NEW.sets := 1;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_cardio_single_set ON public.program_template_exercises;
CREATE TRIGGER trg_cardio_single_set
BEFORE INSERT OR UPDATE ON public.program_template_exercises
FOR EACH ROW EXECUTE FUNCTION public.enforce_cardio_single_set();

DROP TRIGGER IF EXISTS trg_cardio_single_set ON public.assigned_program_exercises;
CREATE TRIGGER trg_cardio_single_set
BEFORE INSERT OR UPDATE ON public.assigned_program_exercises
FOR EACH ROW EXECUTE FUNCTION public.enforce_cardio_single_set();
