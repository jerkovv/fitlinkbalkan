-- Prazna ponavljanja u prvoj seriji obarala su cuvanje cele vezbe (23502), jer se
-- ponavljanja prve serije prepisuju u NOT NULL kolonu vezbe. Tip serije se i dalje
-- cuva kad kljuca set_type nema.
CREATE OR REPLACE FUNCTION public.save_exercise_sets(p_scope text, p_exercise_id uuid, p_sets jsonb)
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
  PERFORM public.require_active_trainer_sub();
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
             nullif(elem->>'notes','')                       AS notes,
             CASE WHEN elem ? 'set_type' THEN nullif(elem->>'set_type','')
                  ELSE (SELECT x.set_type FROM public.program_template_exercise_sets x
                        WHERE x.template_exercise_id = p_exercise_id AND x.set_number = t.ord)
             END                                             AS set_type
      FROM jsonb_array_elements(p_sets) WITH ORDINALITY AS t(elem, ord)
    ),
    upserted AS (
      INSERT INTO public.program_template_exercise_sets
        (template_exercise_id, set_number, reps, weight_kg, rest_seconds, notes, set_type)
      SELECT p_exercise_id, set_number, reps, weight_kg, rest_seconds, notes, set_type FROM incoming
      ON CONFLICT (template_exercise_id, set_number)
      DO UPDATE SET reps = EXCLUDED.reps, weight_kg = EXCLUDED.weight_kg,
                    rest_seconds = EXCLUDED.rest_seconds, notes = EXCLUDED.notes,
                    set_type = EXCLUDED.set_type
      RETURNING 1
    )
    DELETE FROM public.program_template_exercise_sets
    WHERE template_exercise_id = p_exercise_id AND set_number > v_n;

    SELECT reps, weight_kg INTO v_first_reps, v_first_weight
    FROM public.program_template_exercise_sets
    WHERE template_exercise_id = p_exercise_id AND set_number = 1;

    -- reps na vezbi je NOT NULL: prva serija bez ponavljanja (do otkaza, ili polje
    -- prazno dok trener kuca) ne sme da obori cuvanje svih serija te vezbe.
    UPDATE public.program_template_exercises
    SET sets = v_n, reps = COALESCE(v_first_reps, reps), weight_kg = v_first_weight
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
             nullif(elem->>'notes','')                       AS notes,
             CASE WHEN elem ? 'set_type' THEN nullif(elem->>'set_type','')
                  ELSE (SELECT x.set_type FROM public.assigned_program_exercise_sets x
                        WHERE x.assigned_exercise_id = p_exercise_id AND x.set_number = t.ord)
             END                                             AS set_type
      FROM jsonb_array_elements(p_sets) WITH ORDINALITY AS t(elem, ord)
    ),
    upserted AS (
      INSERT INTO public.assigned_program_exercise_sets
        (assigned_exercise_id, set_number, reps, weight_kg, rest_seconds, notes, set_type)
      SELECT p_exercise_id, set_number, reps, weight_kg, rest_seconds, notes, set_type FROM incoming
      ON CONFLICT (assigned_exercise_id, set_number)
      DO UPDATE SET reps = EXCLUDED.reps, weight_kg = EXCLUDED.weight_kg,
                    rest_seconds = EXCLUDED.rest_seconds, notes = EXCLUDED.notes,
                    set_type = EXCLUDED.set_type
      RETURNING 1
    )
    DELETE FROM public.assigned_program_exercise_sets
    WHERE assigned_exercise_id = p_exercise_id AND set_number > v_n;

    SELECT reps, weight_kg INTO v_first_reps, v_first_weight
    FROM public.assigned_program_exercise_sets
    WHERE assigned_exercise_id = p_exercise_id AND set_number = 1;

    -- Isto kao gore: prazna ponavljanja prve serije ne diraju NOT NULL kolonu vezbe.
    UPDATE public.assigned_program_exercises
    SET sets = v_n, reps = COALESCE(v_first_reps, reps), weight_kg = v_first_weight
    WHERE id = p_exercise_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'sets', v_n);
END;
$function$
;
