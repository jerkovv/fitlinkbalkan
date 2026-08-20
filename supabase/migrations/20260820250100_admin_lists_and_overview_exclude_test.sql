-- Admin liste nose is_test, a Pregled broji samo PRAVE korisnike.
--
-- Pregled je do sada uzimao sve iz user_roles i trainer_subscriptions, pa je 40
-- test naloga ulazilo i u broj korisnika i u pretplate - dakle i u prikazani
-- prihod. Test nalozi se sada odbijaju, a njihov broj se prijavljuje zasebno
-- (test_accounts_total), da brojevi ne padnu bez objasnjenja.
--
-- is_test je podrazumevano FALSE: nalog je pravi dok ga admin izricito ne
-- oznaci, pa novi korisnik nikad ne moze tiho da nestane iz spiska.
CREATE OR REPLACE FUNCTION public.admin_list_trainers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
    from (
      select tr.id,
             p.full_name,
             u.email,
             p.phone,
             tr.city, tr.studio_name, tr.hourly_rate, tr.invite_code, tr.bio,
             tr.created_at, tr.years_experience, tr.instagram_handle,
             coalesce(tr.avatar_url, p.avatar_url) as avatar_url,
             tr.public_enabled,
             ts.status::text as sub_status,
             ts.plan::text   as sub_plan,
             ts.access_until  as sub_access_until,
             (select count(*) from athletes a where a.trainer_id = tr.id) as athlete_count,
             exists (select 1 from admin_test_accounts ta where ta.user_id = tr.id) as is_test
      from trainers tr
      left join profiles p on p.id = tr.id
      left join auth.users u on u.id = tr.id
      left join trainer_subscriptions ts on ts.trainer_id = tr.id
    ) t
  );
end
$$;

CREATE OR REPLACE FUNCTION public.admin_list_athletes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.joined_at desc), '[]'::jsonb)
    from (
      select a.id,
             p.full_name, u.email, p.phone, p.avatar_url,
             a.trainer_id, ptr.full_name as trainer_name,
             a.goal::text as goal, a.height_cm, a.weight_kg, a.notes,
             a.birth_year, a.gender, a.signup_source, a.joined_at,
             (select count(*) from workout_session_logs w
                where w.athlete_id = a.id and w.completed_at is not null) as workouts_done,
             (select max(w.completed_at) from workout_session_logs w
                where w.athlete_id = a.id and w.completed_at is not null) as last_workout,
             (select count(*) from assigned_programs ap where ap.athlete_id = a.id) as programs_count,
             exists (select 1 from admin_test_accounts ta where ta.user_id = a.id) as is_test
      from athletes a
      left join profiles p on p.id = a.id
      left join auth.users u on u.id = a.id
      left join profiles ptr on ptr.id = a.trainer_id
    ) t
  );
end
$$;

CREATE OR REPLACE FUNCTION public.admin_overview_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  with test AS (SELECT user_id FROM admin_test_accounts)
  select jsonb_build_object(
    'trainers_total',        (select count(*) from user_roles ur where ur.role = 'trainer'
                                and ur.user_id not in (select user_id from test)),
    'athletes_total',        (select count(*) from user_roles ur where ur.role = 'athlete'
                                and ur.user_id not in (select user_id from test)),
    'subs_active_total',     (select count(*) from trainer_subscriptions s where s.status in ('trialing','active','past_due') and s.access_until > now()
                                and s.trainer_id not in (select user_id from test)),
    'subs_trialing',         (select count(*) from trainer_subscriptions s where s.status = 'trialing' and s.access_until > now()
                                and s.trainer_id not in (select user_id from test)),
    'subs_paid',             (select count(*) from trainer_subscriptions s where s.status = 'active' and s.access_until > now()
                                and s.trainer_id not in (select user_id from test)),
    'subs_monthly',          (select count(*) from trainer_subscriptions s where s.plan = 'monthly' and s.status in ('trialing','active','past_due') and s.access_until > now()
                                and s.trainer_id not in (select user_id from test)),
    'subs_yearly',           (select count(*) from trainer_subscriptions s where s.plan = 'yearly' and s.status in ('active','past_due') and s.access_until > now()
                                and s.trainer_id not in (select user_id from test)),
    'subs_canceled_expired', (select count(*) from trainer_subscriptions s where (s.status in ('canceled','expired') or (s.access_until is not null and s.access_until <= now()))
                                and s.trainer_id not in (select user_id from test)),
    'revenue_monthly_eur',   (select coalesce(count(*),0) * 49 from trainer_subscriptions s where s.plan = 'monthly' and s.status = 'active' and s.access_until > now()
                                and s.trainer_id not in (select user_id from test)),
    'new_trainers_7d',       (select count(*) from user_roles ur where ur.role = 'trainer' and ur.created_at > now() - interval '7 days'
                                and ur.user_id not in (select user_id from test)),
    'new_athletes_7d',       (select count(*) from user_roles ur where ur.role = 'athlete' and ur.created_at > now() - interval '7 days'
                                and ur.user_id not in (select user_id from test)),
    'test_accounts_total',   (select count(*) from test),
    'open_media_reports',    (select count(*) from exercise_media_reports where status = 'open'),
    'exercises_total',       (select count(*) from exercises),
    'food_items_total',      (select count(*) from food_items)
  ) into result;
  return result;
end
$$;
