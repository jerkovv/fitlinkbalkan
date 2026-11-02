-- Svaka namirnica ima svoj znak (jedan emoji) koji aplikacija crta uz nju umesto
-- nasumicne fotografije. NULL = aplikacija bira znak sama, po nazivu i kategoriji.
ALTER TABLE public.food_items ADD COLUMN IF NOT EXISTS icon text;
COMMENT ON COLUMN public.food_items.icon IS 'Znak namirnice: jedan emoji. NULL = klijent bira po nazivu i kategoriji.';
