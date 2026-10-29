-- Licna namirnica trenera (is_global = false) bila je vidljiva svima, i bez prijave:
-- politika "Anyone can read food items" je imala USING (true) za ulogu public, a
-- dozvoljavajuce politike se sabiraju sa OR, pa je ona ponistavala onu uzu.
-- Forma u aplikaciji kaze treneru da namirnicu vidi samo on.
--
-- Posle ove izmene:
--   * bez prijave i dalje se citaju samo zajednicke namirnice (is_global = true),
--   * prijavljen korisnik vidi zajednicke, svoje licne i one licne koje stoje u
--     planu ishrane ili dnevniku koji sme da vidi (vezbac kome je trener stavio
--     svoju namirnicu u plan mora da joj vidi ime i makroe).
-- Podupiti idu kroz RLS tabela assigned_nutrition_meal_items i nutrition_logs, pa
-- pravilo "ko vidi stavku, vidi i namirnicu" ne trazi novu funkciju. Nijedna
-- politika tih tabela ne cita food_items, pa nema kruzne provere.
-- Admin i dalje vidi sve kroz admin_select_food. Vrednosti i redovi se ne diraju.

ALTER POLICY "Anyone can read food items" ON public.food_items
  USING (is_global = true);

ALTER POLICY "Anyone authenticated can view global or own foods" ON public.food_items
  USING (
    is_global = true
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.assigned_nutrition_meal_items i WHERE i.food_id = food_items.id)
    OR EXISTS (SELECT 1 FROM public.nutrition_logs l WHERE l.food_id = food_items.id)
  );
