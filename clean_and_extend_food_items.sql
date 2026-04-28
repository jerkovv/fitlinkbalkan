-- =====================================================================
-- FitLink — Čišćenje junk food + dodavanje fitness namirnica
-- Verzija 3: sigurna na bilo koju početnu šemu food_items tabele
-- =====================================================================

-- 1) Osiguraj da kolone postoje (dodaje samo ako fale)
ALTER TABLE public.food_items ADD COLUMN IF NOT EXISTS category       text;
ALTER TABLE public.food_items ADD COLUMN IF NOT EXISTS kcal_per_100g  numeric;
ALTER TABLE public.food_items ADD COLUMN IF NOT EXISTS protein_g      numeric;
ALTER TABLE public.food_items ADD COLUMN IF NOT EXISTS carbs_g        numeric;
ALTER TABLE public.food_items ADD COLUMN IF NOT EXISTS fat_g          numeric;

-- 2) UNIQUE na name (za ON CONFLICT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'food_items_name_unique'
  ) THEN
    ALTER TABLE public.food_items
      ADD CONSTRAINT food_items_name_unique UNIQUE (name);
  END IF;
END$$;

-- 3) Obriši junk food iz plan stavki pa iz biblioteke
DELETE FROM public.nutrition_plan_meal_items
WHERE food_id IN (
  SELECT id FROM public.food_items
  WHERE name ILIKE ANY (ARRAY[
    '%coca%','%cola%','%pepsi%','%fanta%','%sprite%','%sok%','%juice%',
    '%chips%','%čips%','%cips%','%snickers%','%mars%','%twix%','%bounty%',
    '%kitkat%','%kit kat%','%milka%','%nutella%','%oreo%','%cookie%',
    '%biscuit%','%keks%','%torta%','%cake%','%donut%','%krofna%',
    '%pizza%','%burger%','%hamburger%','%cheeseburger%','%hot dog%',
    '%hotdog%','%kebab%','%pljeskavica%','%cevapi%','%ćevap%',
    '%pomfrit%','%fries%','%mcdonald%','%kfc%','%burger king%',
    '%candy%','%bombon%','%lollipop%','%lizalica%','%marshmallow%',
    '%ice cream%','%sladoled%','%gummy%','%chocolate bar%',
    '%energy drink%','%red bull%','%monster%','%rockstar%',
    '%beer%','%pivo%','%wine%','%vino%','%vodka%','%whiskey%','%rakija%'
  ])
);

DELETE FROM public.food_items
WHERE name ILIKE ANY (ARRAY[
  '%coca%','%cola%','%pepsi%','%fanta%','%sprite%','%sok%','%juice%',
  '%chips%','%čips%','%cips%','%snickers%','%mars%','%twix%','%bounty%',
  '%kitkat%','%kit kat%','%milka%','%nutella%','%oreo%','%cookie%',
  '%biscuit%','%keks%','%torta%','%cake%','%donut%','%krofna%',
  '%pizza%','%burger%','%hamburger%','%cheeseburger%','%hot dog%',
  '%hotdog%','%kebab%','%pljeskavica%','%cevapi%','%ćevap%',
  '%pomfrit%','%fries%','%mcdonald%','%kfc%','%burger king%',
  '%candy%','%bombon%','%lollipop%','%lizalica%','%marshmallow%',
  '%ice cream%','%sladoled%','%gummy%','%chocolate bar%',
  '%energy drink%','%red bull%','%monster%','%rockstar%',
  '%beer%','%pivo%','%wine%','%vino%','%vodka%','%whiskey%','%rakija%'
]);

-- 4) Ubaci/azuriraj fitness namirnice (vrednosti na 100 g)
INSERT INTO public.food_items (name, category, kcal_per_100g, protein_g, carbs_g, fat_g) VALUES
-- PROTEINI
('Pileće belo meso',           'Proteini',  165, 31.0,  0.0,  3.6),
('Ćureće belo meso',           'Proteini',  135, 30.0,  0.0,  1.0),
('Govedina (mršava)',          'Proteini',  217, 26.0,  0.0, 12.0),
('Teletina',                   'Proteini',  172, 24.0,  0.0,  8.0),
('Losos',                      'Proteini',  208, 20.0,  0.0, 13.0),
('Tuna (sveža)',               'Proteini',  132, 28.0,  0.0,  1.0),
('Tuna u sopstvenom soku',     'Proteini',  116, 26.0,  0.0,  1.0),
('Oslić',                      'Proteini',   88, 18.3,  0.0,  1.3),
('Bakalar',                    'Proteini',   82, 18.0,  0.0,  0.7),
('Skuša',                      'Proteini',  205, 19.0,  0.0, 14.0),
('Jaja (cela)',                'Proteini',  155, 13.0,  1.1, 11.0),
('Belance',                    'Proteini',   52, 11.0,  0.7,  0.2),
('Grčki jogurt 2%',            'Proteini',   73, 10.0,  3.6,  1.9),
('Skyr',                       'Proteini',   63, 11.0,  4.0,  0.2),
('Svežii kravlji sir light',   'Proteini',   98, 12.0,  3.4,  4.3),
('Mocarela light',             'Proteini',  150, 24.0,  2.2,  6.0),
('Kotidž sir',                 'Proteini',   98, 11.0,  3.4,  4.3),
('Whey protein (prah)',        'Proteini',  370, 75.0, 10.0,  5.0),

-- UGLJENI HIDRATI
('Pirinač beli (kuvani)',      'Ugljeni hidrati', 130,  2.7, 28.0, 0.3),
('Pirinač basmati (kuvani)',   'Ugljeni hidrati', 121,  3.0, 25.0, 0.4),
('Pirinač integralni (kuvani)','Ugljeni hidrati', 112,  2.6, 23.0, 0.9),
('Ovsene pahuljice',           'Ugljeni hidrati', 389, 16.9, 66.3, 6.9),
('Heljda (kuvana)',            'Ugljeni hidrati',  92,  3.4, 19.9, 0.6),
('Kinoa (kuvana)',             'Ugljeni hidrati', 120,  4.4, 21.3, 1.9),
('Krompir (kuvani)',           'Ugljeni hidrati',  87,  1.9, 20.1, 0.1),
('Slatki krompir (kuvani)',    'Ugljeni hidrati',  86,  1.6, 20.1, 0.1),
('Integralni hleb',            'Ugljeni hidrati', 247, 13.0, 41.0, 3.4),
('Ražani hleb',                'Ugljeni hidrati', 259,  8.5, 48.0, 3.3),
('Testenina integralna (kuvana)','Ugljeni hidrati',124, 5.3, 26.5, 0.5),
('Pasulj beli (kuvani)',       'Ugljeni hidrati', 139,  9.7, 25.1, 0.5),
('Sočivo (kuvano)',            'Ugljeni hidrati', 116,  9.0, 20.0, 0.4),
('Leblebije (kuvane)',         'Ugljeni hidrati', 164,  8.9, 27.4, 2.6),

-- MASTI
('Avokado',                    'Masti', 160,  2.0,  9.0, 15.0),
('Maslinovo ulje',             'Masti', 884,  0.0,  0.0,100.0),
('Kokosovo ulje',              'Masti', 862,  0.0,  0.0,100.0),
('Putar od kikirikija',        'Masti', 588, 25.0, 20.0, 50.0),
('Bademi',                     'Masti', 579, 21.0, 22.0, 50.0),
('Orasi',                      'Masti', 654, 15.0, 14.0, 65.0),
('Lešnici',                    'Masti', 628, 15.0, 17.0, 61.0),
('Indijski orah',              'Masti', 553, 18.0, 30.0, 44.0),
('Chia semenke',               'Masti', 486, 17.0, 42.0, 31.0),
('Lanene semenke',             'Masti', 534, 18.0, 29.0, 42.0),

-- POVRĆE
('Brokoli',                    'Povrće',  34,  2.8,  7.0, 0.4),
('Karfiol',                    'Povrće',  25,  1.9,  5.0, 0.3),
('Spanać',                     'Povrće',  23,  2.9,  3.6, 0.4),
('Kelj',                       'Povrće',  49,  4.3,  9.0, 0.9),
('Paradajz',                   'Povrće',  18,  0.9,  3.9, 0.2),
('Krastavac',                  'Povrće',  16,  0.7,  3.6, 0.1),
('Paprika',                    'Povrće',  31,  1.0,  6.0, 0.3),
('Šargarepa',                  'Povrće',  41,  0.9,  9.6, 0.2),
('Tikvice',                    'Povrće',  17,  1.2,  3.1, 0.3),

-- VOĆE
('Banana',                     'Voće',  89,  1.1, 22.8, 0.3),
('Jabuka',                     'Voće',  52,  0.3, 14.0, 0.2),
('Borovnice',                  'Voće',  57,  0.7, 14.5, 0.3),
('Jagode',                     'Voće',  32,  0.7,  7.7, 0.3),
('Maline',                     'Voće',  52,  1.2, 11.9, 0.7),
('Pomorandža',                 'Voće',  47,  0.9, 11.8, 0.1),
('Kivi',                       'Voće',  61,  1.1, 14.7, 0.5),
('Ananas',                     'Voće',  50,  0.5, 13.1, 0.1),

-- SUPLEMENTI
('Kreatin monohidrat',         'Suplementi',   0,  0.0,  0.0, 0.0),
('BCAA (prah)',                'Suplementi',  40, 10.0,  0.0, 0.0),
('Kazein (prah)',              'Suplementi', 360, 80.0,  5.0, 1.0)
ON CONFLICT (name) DO UPDATE SET
  category      = EXCLUDED.category,
  kcal_per_100g = EXCLUDED.kcal_per_100g,
  protein_g     = EXCLUDED.protein_g,
  carbs_g       = EXCLUDED.carbs_g,
  fat_g         = EXCLUDED.fat_g;
