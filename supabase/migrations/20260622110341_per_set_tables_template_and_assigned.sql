-- ============ TEMPLATE SETS ============
CREATE TABLE IF NOT EXISTS public.program_template_exercise_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_exercise_id uuid NOT NULL REFERENCES public.program_template_exercises(id) ON DELETE CASCADE,
  set_number integer NOT NULL,
  reps text,
  weight_kg numeric,
  rest_seconds integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_exercise_id, set_number)
);
CREATE INDEX IF NOT EXISTS idx_ptes_exercise ON public.program_template_exercise_sets(template_exercise_id);

ALTER TABLE public.program_template_exercise_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trener upravlja setovima svojih templata"
ON public.program_template_exercise_sets
FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.program_template_exercises pte
  JOIN public.program_template_days d ON d.id = pte.day_id
  JOIN public.program_templates t ON t.id = d.template_id
  WHERE pte.id = program_template_exercise_sets.template_exercise_id
    AND t.trainer_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.program_template_exercises pte
  JOIN public.program_template_days d ON d.id = pte.day_id
  JOIN public.program_templates t ON t.id = d.template_id
  WHERE pte.id = program_template_exercise_sets.template_exercise_id
    AND t.trainer_id = auth.uid()
));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_template_exercise_sets TO authenticated, service_role;

-- ============ ASSIGNED SETS ============
CREATE TABLE IF NOT EXISTS public.assigned_program_exercise_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_exercise_id uuid NOT NULL REFERENCES public.assigned_program_exercises(id) ON DELETE CASCADE,
  set_number integer NOT NULL,
  reps text,
  weight_kg numeric,
  rest_seconds integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assigned_exercise_id, set_number)
);
CREATE INDEX IF NOT EXISTS idx_apes_exercise ON public.assigned_program_exercise_sets(assigned_exercise_id);

ALTER TABLE public.assigned_program_exercise_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pristup setovima dodeljenih programa"
ON public.assigned_program_exercise_sets
FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.assigned_program_exercises ape
  JOIN public.assigned_program_days d ON d.id = ape.day_id
  JOIN public.assigned_programs p ON p.id = d.assigned_program_id
  WHERE ape.id = assigned_program_exercise_sets.assigned_exercise_id
    AND (p.trainer_id = auth.uid() OR p.athlete_id = auth.uid())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.assigned_program_exercises ape
  JOIN public.assigned_program_days d ON d.id = ape.day_id
  JOIN public.assigned_programs p ON p.id = d.assigned_program_id
  WHERE ape.id = assigned_program_exercise_sets.assigned_exercise_id
    AND p.trainer_id = auth.uid()
));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assigned_program_exercise_sets TO authenticated, service_role;

-- ============ BACKFILL (postojeci programi -> N identicnih setova) ============
INSERT INTO public.program_template_exercise_sets (template_exercise_id, set_number, reps, weight_kg, rest_seconds)
SELECT pte.id, gs.n, pte.reps, pte.weight_kg, pte.rest_seconds
FROM public.program_template_exercises pte
CROSS JOIN LATERAL generate_series(1, pte.sets) AS gs(n)
WHERE pte.sets IS NOT NULL AND pte.sets > 0
ON CONFLICT (template_exercise_id, set_number) DO NOTHING;

INSERT INTO public.assigned_program_exercise_sets (assigned_exercise_id, set_number, reps, weight_kg, rest_seconds)
SELECT ape.id, gs.n, ape.reps, ape.weight_kg, ape.rest_seconds
FROM public.assigned_program_exercises ape
CROSS JOIN LATERAL generate_series(1, ape.sets) AS gs(n)
WHERE ape.sets IS NOT NULL AND ape.sets > 0 AND ape.deleted_at IS NULL
ON CONFLICT (assigned_exercise_id, set_number) DO NOTHING;
