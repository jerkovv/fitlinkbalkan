-- =====================================================================
-- FitLink — KORAK 1 (FIX): Reset food_items po stvarnim imenima kolona
-- Tvoje postojeće kolone: protein_per_100g, carbs_per_100g, fat_per_100g
-- =====================================================================

-- 1) Obriši plan/log redove koji referenciraju food_items
DELETE FROM public.nutrition_plan_meal_items WHERE food_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='food_logs') THEN
    EXECUTE 'DELETE FROM public.food_logs';
  END IF;
END$$;

-- 2) Obriši sve namirnice
TRUNCATE TABLE public.food_items RESTART IDENTITY CASCADE;

-- 3) Dodaj nove kolone (zadržavamo postojeća imena makro kolona)
ALTER TABLE public.food_items
  ADD COLUMN IF NOT EXISTS serving_size_g  numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS is_vegan        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_gluten_free  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_posno        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS za_trenera      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now();

-- 4) NOT NULL na osnovne kolone
ALTER TABLE public.food_items
  ALTER COLUMN name             SET NOT NULL,
  ALTER COLUMN category         SET NOT NULL,
  ALTER COLUMN kcal_per_100g    SET NOT NULL,
  ALTER COLUMN protein_per_100g SET NOT NULL,
  ALTER COLUMN carbs_per_100g   SET NOT NULL,
  ALTER COLUMN fat_per_100g     SET NOT NULL;

-- 5) UNIQUE na name
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_items_name_unique') THEN
    ALTER TABLE public.food_items ADD CONSTRAINT food_items_name_unique UNIQUE (name);
  END IF;
END$$;

-- 6) Indeksi (uklj. trigram za fast ilike pretragu)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_food_items_category   ON public.food_items(category);
CREATE INDEX IF NOT EXISTS idx_food_items_za_trenera ON public.food_items(za_trenera);
CREATE INDEX IF NOT EXISTS idx_food_items_name_trgm  ON public.food_items USING gin (name gin_trgm_ops);

-- 7) RLS
ALTER TABLE public.food_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read food items" ON public.food_items;
CREATE POLICY "Anyone can read food items"
  ON public.food_items FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated can insert food items" ON public.food_items;
CREATE POLICY "Authenticated can insert food items"
  ON public.food_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 8) Trigger za updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;$$;

DROP TRIGGER IF EXISTS trg_food_items_updated_at ON public.food_items;
CREATE TRIGGER trg_food_items_updated_at
  BEFORE UPDATE ON public.food_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Provera
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='food_items'
ORDER BY ordinal_position;
