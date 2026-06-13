-- DRAFT mehanizam: published_at na dodeljenim planovima. Custom plan se kreira
-- kao draft (published_at NULL, nevidljiv vezbacu); "Posalji vezbacu" ga objavi.
-- Backfill: svi postojeci redovi (pre uvodjenja drafta) se tretiraju kao objavljeni.
-- Vec primenjeno na bazu preko MCP; ovaj fajl je samo za version control.

ALTER TABLE public.assigned_programs ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE public.assigned_nutrition_plans ADD COLUMN IF NOT EXISTS published_at timestamptz;

UPDATE public.assigned_programs SET published_at = assigned_at WHERE published_at IS NULL;
UPDATE public.assigned_nutrition_plans SET published_at = assigned_at WHERE published_at IS NULL;
