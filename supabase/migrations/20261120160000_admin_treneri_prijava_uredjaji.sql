-- Admin, spisak trenera: potvrda mejla, poslednja prijava, proba bez kartice i uredjaji.
-- Uredjaji dolaze iz device_push_tokens (platforma, paket, kad je znak poslednji put osvezen) i
-- watch_pairing_tokens (sat). Sami znakovi se nikad ne vracaju. Verzija aplikacije i model telefona
-- se nigde ne cuvaju, pa ih nema.

create or replace function public.admin_list_trainers()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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
             (ts.status::text = 'trialing' and ts.stripe_subscription_id is null and ts.trial_ends_at is not null) as proba_bez_kartice,
             (select count(*) from athletes a where a.trainer_id = tr.id) as athlete_count,
             exists (select 1 from admin_test_accounts ta where ta.user_id = tr.id) as is_test,
             u.email_confirmed_at,
             u.last_sign_in_at,
             (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'platforma', d.platform,
                        'paket', d.bundle,
                        'poslednji', d.poslednji,
                        'broj', d.broj) order by d.poslednji desc), '[]'::jsonb)
               from (
                 select dpt.platform, dpt.bundle, max(coalesce(dpt.updated_at, dpt.created_at)) as poslednji, count(*) as broj
                 from device_push_tokens dpt
                 where dpt.user_id = tr.id
                 group by dpt.platform, dpt.bundle
               ) d
             ) as uredjaji,
             (
               select max(w.last_used_at)
               from watch_pairing_tokens w
               where w.user_id = tr.id and w.revoked_at is null
             ) as sat_poslednji
      from trainers tr
      left join profiles p on p.id = tr.id
      left join auth.users u on u.id = tr.id
      left join trainer_subscriptions ts on ts.trainer_id = tr.id
    ) t
  );
end
$$;
