-- Atomicno snimanje set-redova za jednu vezbu, u jednoj transakciji.
-- Radi za oba moda: p_scope = 'template' ili 'assigned'.
-- p_sets je JSON niz: [{"reps":"10","weight_kg":40,"rest_seconds":90}, ...] u redosledu setova.
-- set_number se dodeljuje 1..n po redosledu u nizu (gap-free). Visak se brise. Parent sazetak se sinhronizuje.

CREATE OR REPLACE FUNCTION public.save_exercise_sets(
  p_scope text,
  p_exercise_id uuid,
  p_sets jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_n int;
  v_first_reps text;
  v_first_weight numeric;
  v_owner_ok boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni'; END IF;
  IF p_scope NOT IN ('template','assigned') THEN RAISE EXCEPTION 'Nepoznat scope'; END IF;
  IF jsonb_typeof(p_sets) <> 'array' THEN RAISE EXCEPTION 'p_sets mora biti niz'; END IF;

  v_n := jsonb_array_length(p_sets);
  IF v_n < 1 THEN RAISE EXCEPTION 'Mora postojati bar jedan set'; END IF;

  -- vlasnistvo + grananje po modu
  IF p_scope = 'template' THEN
    SELECT true INTO v_owner_ok
    FROM public.program_template_exercises pte
    JOIN public.program_template_days d ON d.id = pte.day_id
    JOIN public.program_templates t ON t.id = d.template_id
    WHERE pte.id = p_exercise_id AND t.trainer_id = v_uid;
    IF NOT coalesce(v_owner_ok,false) THEN RAISE EXCEPTION 'Nemate pristup ovoj vezbi'; END IF;

    -- normalizovani redovi iz JSON-a sa rednim brojem 1..n
    WITH incoming AS (
      SELECT (row_number() OVER ())::int AS set_number,
             nullif(elem->>'reps','')                        AS reps,
             nullif(elem->>'weight_kg','')::numeric          AS weight_kg,
             nullif(elem->>'rest_seconds','')::int           AS rest_seconds,
             nullif(elem->>'notes','')                       AS notes
      FROM jsonb_array_elements(p_sets) WITH ORDINALITY AS t(elem, ord)
    ),
    upserted AS (
      INSERT INTO public.program_template_exercise_sets
        (template_exercise_id, set_number, reps, weight_kg, rest_seconds, notes)
      SELECT p_exercise_id, set_number, reps, weight_kg, rest_seconds, notes FROM incoming
      ON CONFLICT (template_exercise_id, set_number)
      DO UPDATE SET reps = EXCLUDED.reps, weight_kg = EXCLUDED.weight_kg,
                    rest_seconds = EXCLUDED.rest_seconds, notes = EXCLUDED.notes
      RETURNING 1
    )
    DELETE FROM public.program_template_exercise_sets
    WHERE template_exercise_id = p_exercise_id AND set_number > v_n;

    SELECT reps, weight_kg INTO v_first_reps, v_first_weight
    FROM public.program_template_exercise_sets
    WHERE template_exercise_id = p_exercise_id AND set_number = 1;

    UPDATE public.program_template_exercises
    SET sets = v_n, reps = v_first_reps, weight_kg = v_first_weight
    WHERE id = p_exercise_id;

  ELSE
    SELECT true INTO v_owner_ok
    FROM public.assigned_program_exercises ape
    JOIN public.assigned_program_days d ON d.id = ape.day_id
    JOIN public.assigned_programs p ON p.id = d.assigned_program_id
    WHERE ape.id = p_exercise_id AND p.trainer_id = v_uid;
    IF NOT coalesce(v_owner_ok,false) THEN RAISE EXCEPTION 'Nemate pristup ovoj vezbi'; END IF;

    WITH incoming AS (
      SELECT (row_number() OVER ())::int AS set_number,
             nullif(elem->>'reps','')                        AS reps,
             nullif(elem->>'weight_kg','')::numeric          AS weight_kg,
             nullif(elem->>'rest_seconds','')::int           AS rest_seconds,
             nullif(elem->>'notes','')                       AS notes
      FROM jsonb_array_elements(p_sets) WITH ORDINALITY AS t(elem, ord)
    ),
    upserted AS (
      INSERT INTO public.assigned_program_exercise_sets
        (assigned_exercise_id, set_number, reps, weight_kg, rest_seconds, notes)
      SELECT p_exercise_id, set_number, reps, weight_kg, rest_seconds, notes FROM incoming
      ON CONFLICT (assigned_exercise_id, set_number)
      DO UPDATE SET reps = EXCLUDED.reps, weight_kg = EXCLUDED.weight_kg,
                    rest_seconds = EXCLUDED.rest_seconds, notes = EXCLUDED.notes
      RETURNING 1
    )
    DELETE FROM public.assigned_program_exercise_sets
    WHERE assigned_exercise_id = p_exercise_id AND set_number > v_n;

    SELECT reps, weight_kg INTO v_first_reps, v_first_weight
    FROM public.assigned_program_exercise_sets
    WHERE assigned_exercise_id = p_exercise_id AND set_number = 1;

    UPDATE public.assigned_program_exercises
    SET sets = v_n, reps = v_first_reps, weight_kg = v_first_weight
    WHERE id = p_exercise_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'sets', v_n);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_exercise_sets(text, uuid, jsonb) TO authenticated, service_role;
