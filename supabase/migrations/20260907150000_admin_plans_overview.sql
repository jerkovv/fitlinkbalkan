-- Admin pregled planova: koji trener ima koliko planova i kojih tacno.
--
-- Dva RPC-a, po ustaljenom obrascu admin panela:
--   admin_list_trainer_plans()          -> go niz (kao admin_list_trainers), za listu
--   admin_trainer_plans_detail(trener)  -> {success, ...} (kao admin_trainer_athletes_detail)
--
-- Brojanje vezbi je namerno suzeno na OSNOVNI plan:
--   deleted_at IS NULL      - meko obrisane vezbe se ne racunaju
--   session_log_id IS NULL  - trenerova izmena uzivo pravi kopiju vezbe koja vazi
--                             samo za tu sesiju (vidi get_workout_day_full i racvanje);
--                             te kopije nisu deo plana i ne smeju da naduvaju broj.
--
-- Nacrt vs objavljen: vezbac vidi SAMO published_at IS NOT NULL. Zato se svuda
-- broje odvojeno - trener sa gomilom nacrta je znak da nesto ne valja.

-- 1) Lista: jedan red po treneru, sa zbirovima.
CREATE OR REPLACE FUNCTION public.admin_list_trainer_plans()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.planova_ukupno desc, t.full_name), '[]'::jsonb)
    from (
      select
        tr.id,
        p.full_name,
        u.email,
        coalesce(tr.avatar_url, p.avatar_url) as avatar_url,
        tr.created_at,
        exists (select 1 from admin_test_accounts ta where ta.user_id = tr.id) as is_test,

        (select count(*) from program_templates pt where pt.trainer_id = tr.id) as sablona_treninga,
        (select count(*) from nutrition_plan_templates nt where nt.trainer_id = tr.id) as sablona_ishrane,

        (select count(*) from assigned_programs ap
          where ap.trainer_id = tr.id and ap.published_at is not null) as programa_poslato,
        (select count(*) from assigned_programs ap
          where ap.trainer_id = tr.id and ap.published_at is null) as programa_nacrt,

        (select count(*) from assigned_nutrition_plans an
          where an.trainer_id = tr.id and an.published_at is not null) as ishrane_poslato,
        (select count(*) from assigned_nutrition_plans an
          where an.trainer_id = tr.id and an.published_at is null) as ishrane_nacrt,

        (select count(*) from athletes a where a.trainer_id = tr.id) as vezbaca,
        -- koliko vezbaca stvarno IMA plan koji vidi (ovo je merilo, ne broj planova)
        (select count(distinct ap.athlete_id) from assigned_programs ap
          where ap.trainer_id = tr.id and ap.published_at is not null) as vezbaca_sa_planom,

        (select max(ap.published_at) from assigned_programs ap
          where ap.trainer_id = tr.id and ap.published_at is not null) as poslednji_plan_at,

        -- samo za podrazumevano sortiranje liste
        (select count(*) from program_templates pt where pt.trainer_id = tr.id)
        + (select count(*) from nutrition_plan_templates nt where nt.trainer_id = tr.id)
        + (select count(*) from assigned_programs ap where ap.trainer_id = tr.id)
        + (select count(*) from assigned_nutrition_plans an where an.trainer_id = tr.id)
          as planova_ukupno
      from trainers tr
      left join profiles p on p.id = tr.id
      left join auth.users u on u.id = tr.id
    ) t
  );
end
$function$;

-- 2) Detalj: koji su to tacno planovi kod jednog trenera.
CREATE OR REPLACE FUNCTION public.admin_trainer_plans_detail(p_trainer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_trener jsonb;
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'error', 'not_admin');
  end if;

  select jsonb_build_object(
    'id', tr.id,
    'full_name', p.full_name,
    'email', u.email,
    'avatar_url', coalesce(tr.avatar_url, p.avatar_url)
  ) into v_trener
  from trainers tr
  left join profiles p on p.id = tr.id
  left join auth.users u on u.id = tr.id
  where tr.id = p_trainer_id;

  if v_trener is null then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'success', true,
    'trainer', v_trener,

    'program_templates', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select pt.id, pt.name, pt.goal, pt.level, pt.created_at,
          (select count(*) from program_template_days d where d.template_id = pt.id) as dana,
          (select count(*) from program_template_exercises e
            join program_template_days d on d.id = e.day_id
            where d.template_id = pt.id) as vezbi,
          (select count(*) from assigned_programs ap where ap.source_template_id = pt.id) as puta_dodeljen
        from program_templates pt where pt.trainer_id = p_trainer_id
      ) x), '[]'::jsonb),

    'nutrition_templates', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select nt.id, nt.name, nt.goal, nt.target_kcal, nt.created_at,
          (select count(*) from nutrition_plan_days d where d.template_id = nt.id) as dana,
          (select count(*) from nutrition_plan_meals m
            join nutrition_plan_days d on d.id = m.day_id
            where d.template_id = nt.id) as obroka,
          (select count(*) from assigned_nutrition_plans an where an.source_template_id = nt.id) as puta_dodeljen
        from nutrition_plan_templates nt where nt.trainer_id = p_trainer_id
      ) x), '[]'::jsonb),

    'assigned_programs', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.assigned_at desc) from (
        select ap.id, ap.name, ap.athlete_id, pa.full_name as athlete_name,
          ap.assigned_at, ap.published_at,
          (ap.source_template_id is not null) as iz_sablona,
          (select pt.name from program_templates pt where pt.id = ap.source_template_id) as sablon_naziv,
          (select count(*) from assigned_program_days d
            where d.assigned_program_id = ap.id and d.deleted_at is null) as dana,
          (select count(*) from assigned_program_exercises e
            join assigned_program_days d on d.id = e.day_id
            where d.assigned_program_id = ap.id
              and d.deleted_at is null and e.deleted_at is null
              and e.session_log_id is null) as vezbi,
          (select count(*) from workout_session_logs l
            where l.assigned_program_id = ap.id and l.completed_at is not null) as treninga,
          (select max(l.completed_at) from workout_session_logs l
            where l.assigned_program_id = ap.id and l.completed_at is not null) as poslednji_trening_at
        from assigned_programs ap
        left join profiles pa on pa.id = ap.athlete_id
        where ap.trainer_id = p_trainer_id
      ) x), '[]'::jsonb),

    'assigned_nutrition', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.assigned_at desc) from (
        select an.id, an.name, an.athlete_id, pa.full_name as athlete_name,
          an.assigned_at, an.published_at, an.target_kcal, an.is_active,
          (an.source_template_id is not null) as iz_sablona,
          (select nt.name from nutrition_plan_templates nt where nt.id = an.source_template_id) as sablon_naziv,
          (select count(*) from assigned_nutrition_days d where d.assigned_plan_id = an.id) as dana,
          (select count(*) from assigned_nutrition_meals m
            join assigned_nutrition_days d on d.id = m.day_id
            where d.assigned_plan_id = an.id) as obroka
        from assigned_nutrition_plans an
        left join profiles pa on pa.id = an.athlete_id
        where an.trainer_id = p_trainer_id
      ) x), '[]'::jsonb)
  );
end
$function$;

REVOKE ALL ON FUNCTION public.admin_list_trainer_plans() FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_trainer_plans_detail(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_trainer_plans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_trainer_plans_detail(uuid) TO authenticated;
