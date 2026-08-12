-- Drugi deo serverske brane: direktni upisi u tabele (PostgREST), koje RPC guard
-- iz prethodne migracije ne pokriva.
--
-- Boolean varijanta brane - RLS politika ne sme da baca izuzetak. Vraca TRUE za sve
-- SEM trenera bez aktivne pretplate: vezbac koji azurira current_day svog programa,
-- admin koji dira globalne vezbe/namirnice - svi prolaze kao i pre.
create or replace function public.can_trainer_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then true
    when not exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'trainer'
    ) then true
    else public.trainer_has_active_fitlink_sub(auth.uid())
  end;
$$;

revoke all on function public.can_trainer_write() from public;
grant execute on function public.can_trainer_write() to authenticated, service_role;

-- RESTRICTIVE politike SAMO za pisanje (INSERT/UPDATE/DELETE).
--
-- Zasto restrictive umesto menjanja postojecih: postojece politike su "FOR ALL",
-- dakle pokrivaju i SELECT. Da im se doda provera pretplate, trener bez pretplate
-- ne bi mogao ni da CITA - a cela poenta je da moze da razgleda app (vidi
-- PretplataLockProvider). Restrictive politike se sa postojecim kombinuju preko AND
-- i vezuju se samo za komande koje navedu, pa citanje ostaje netaknuto.
do $$
declare
  t text;
  tabele text[] := array[
    'program_templates','program_template_days','program_template_exercises',
    'program_template_exercise_sets',
    'nutrition_plan_templates','nutrition_plan_days','nutrition_plan_meals',
    'nutrition_plan_meal_items','nutrition_plan_week_schedule',
    'assigned_programs','assigned_program_days','assigned_program_exercises',
    'assigned_program_exercise_sets',
    'assigned_nutrition_plans','assigned_nutrition_days','assigned_nutrition_meals',
    'assigned_nutrition_meal_items','assigned_nutrition_week_schedule',
    'membership_packages','invites','session_types','session_slot_templates',
    'session_slot_overrides','exercises','food_items','trainer_notification_prefs'
  ];
begin
  foreach t in array tabele loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=t
    ) then
      raise exception 'Tabela % ne postoji', t;
    end if;

    execute format('drop policy if exists pretplata_gate_ins on public.%I', t);
    execute format('drop policy if exists pretplata_gate_upd on public.%I', t);
    execute format('drop policy if exists pretplata_gate_del on public.%I', t);

    execute format($f$
      create policy pretplata_gate_ins on public.%I
        as restrictive for insert to authenticated
        with check (public.can_trainer_write())
    $f$, t);

    execute format($f$
      create policy pretplata_gate_upd on public.%I
        as restrictive for update to authenticated
        using (public.can_trainer_write())
        with check (public.can_trainer_write())
    $f$, t);

    execute format($f$
      create policy pretplata_gate_del on public.%I
        as restrictive for delete to authenticated
        using (public.can_trainer_write())
    $f$, t);
  end loop;
end $$;
