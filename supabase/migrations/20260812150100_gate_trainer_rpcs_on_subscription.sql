-- Ubacuje PERFORM public.require_active_trainer_sub() kao prvu naredbu u svaki
-- trenerski RPC (svi su plpgsql + SECURITY DEFINER, pa su usko grlo koje klijent
-- ne moze da zaobidje).
--
-- Radi se programski (pg_get_functiondef -> regexp -> EXECUTE) umesto rucnog
-- prepisivanja 13 tela: manje sanse za gresku u prepisu, i ostaje tacno ako se
-- telo funkcije u medjuvremenu promeni.
--
-- Idempotentno: preskace funkcije koje branu vec imaju.
-- Flag 'i' jer deo funkcija pise "begin" malim slovima. BEZ 'g' - menja se samo
-- PRVI (spoljasnji) BEGIN, ne i ugnjezdeni BEGIN...EXCEPTION blokovi u telu.

do $$
declare
  r record;
  def text;
  newdef text;
  n int := 0;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname = any (array[
        'trainer_unassign_athlete','add_bonus_sessions','create_custom_assigned_program',
        'create_custom_assigned_nutrition_plan','assign_nutrition_plan_to_athlete',
        'assign_program_to_athlete','save_exercise_sets','notify_athlete_about_program',
        'notify_athlete_about_nutrition','confirm_membership_purchase','reject_membership_purchase',
        'broadcast_to_athletes','send_workout_message'])
  loop
    def := pg_get_functiondef(r.oid);

    if position('require_active_trainer_sub' in def) > 0 then
      continue;
    end if;

    newdef := regexp_replace(
      def,
      '(\n[ \t]*BEGIN[ \t]*\n)',
      E'\\1  PERFORM public.require_active_trainer_sub();\n',
      'i'
    );

    -- Ako sablon ne uhvati telo, radije pukni nego da funkcija tiho ostane bez brane.
    if newdef = def then
      raise exception 'Nije nadjen spoljasnji BEGIN u %', r.proname;
    end if;

    execute newdef;
    n := n + 1;
  end loop;

  raise notice 'Brana dodata u % funkcija', n;
end $$;
