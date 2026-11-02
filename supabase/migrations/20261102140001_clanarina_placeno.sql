-- Clanarina: placeno / nije placeno. Trener pri potvrdi zahteva bira da li je novac stigao,
-- a kasnije moze da promeni. Zarada broji samo placeno, po datumu uplate (paid_at).

ALTER TABLE public.membership_purchases ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Sve potvrdjeno do sada se racunalo kao naplaceno u trenutku potvrde.
UPDATE public.membership_purchases
   SET paid_at = COALESCE(decided_at, requested_at)
 WHERE status = 'confirmed' AND paid_at IS NULL;

-- Potvrda dobija p_paid. Podrazumevano placeno, pa veb i sat rade kao do sada.
DROP FUNCTION IF EXISTS public.confirm_membership_purchase(uuid, date);

CREATE FUNCTION public.confirm_membership_purchase(p_purchase_id uuid, p_starts_on date DEFAULT CURRENT_DATE, p_paid boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trainer uuid := auth.uid();
  v_pur     public.membership_purchases%ROWTYPE;
  v_mid     uuid;
  v_has_price     boolean;
  v_has_price_rsd boolean;
BEGIN
  PERFORM public.require_active_trainer_sub();
  SELECT * INTO v_pur FROM public.membership_purchases
   WHERE id = p_purchase_id AND trainer_id = v_trainer AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Zahtev ne postoji ili nije na čekanju';
  END IF;

  UPDATE public.memberships
     SET status = 'expired'
   WHERE athlete_id = v_pur.athlete_id
     AND trainer_id = v_trainer
     AND status = 'active';

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='memberships' AND column_name='price')
    INTO v_has_price;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='memberships' AND column_name='price_rsd')
    INTO v_has_price_rsd;

  IF v_has_price AND v_has_price_rsd THEN
    EXECUTE format(
      'INSERT INTO public.memberships (%s) VALUES (%s, $9) RETURNING id',
      'athlete_id, trainer_id, plan_name, status, starts_on, ends_on, sessions_total, sessions_used, purchase_id, price, price_rsd',
      '$1, $2, $3, ''active'', $4, $5, $6, 0, $7, $8'
    )
    INTO v_mid
    USING v_pur.athlete_id, v_trainer, v_pur.package_name,
          p_starts_on, p_starts_on + v_pur.duration_days,
          v_pur.sessions_count, v_pur.id, v_pur.price_rsd, v_pur.price_rsd;
  ELSIF v_has_price THEN
    EXECUTE
      'INSERT INTO public.memberships (athlete_id, trainer_id, plan_name, status, starts_on, ends_on, sessions_total, sessions_used, purchase_id, price)
       VALUES ($1,$2,$3,''active'',$4,$5,$6,0,$7,$8) RETURNING id'
    INTO v_mid
    USING v_pur.athlete_id, v_trainer, v_pur.package_name,
          p_starts_on, p_starts_on + v_pur.duration_days,
          v_pur.sessions_count, v_pur.id, v_pur.price_rsd;
  ELSIF v_has_price_rsd THEN
    EXECUTE
      'INSERT INTO public.memberships (athlete_id, trainer_id, plan_name, status, starts_on, ends_on, sessions_total, sessions_used, purchase_id, price_rsd)
       VALUES ($1,$2,$3,''active'',$4,$5,$6,0,$7,$8) RETURNING id'
    INTO v_mid
    USING v_pur.athlete_id, v_trainer, v_pur.package_name,
          p_starts_on, p_starts_on + v_pur.duration_days,
          v_pur.sessions_count, v_pur.id, v_pur.price_rsd;
  ELSE
    INSERT INTO public.memberships (
      athlete_id, trainer_id, plan_name, status,
      starts_on, ends_on, sessions_total, sessions_used, purchase_id
    ) VALUES (
      v_pur.athlete_id, v_trainer, v_pur.package_name, 'active',
      p_starts_on, p_starts_on + v_pur.duration_days,
      v_pur.sessions_count, 0, v_pur.id
    ) RETURNING id INTO v_mid;
  END IF;

  UPDATE public.membership_purchases
     SET status = 'confirmed', decided_at = now(),
         paid_at = CASE WHEN COALESCE(p_paid, true) THEN now() END
   WHERE id = p_purchase_id;

  BEGIN
    INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body)
    VALUES (
      v_pur.athlete_id, 'athlete', v_trainer, v_pur.athlete_id, 'membership_activated',
      'Članarina aktivirana',
      v_pur.package_name || ' · ' || v_pur.sessions_count || ' treninga do ' ||
        to_char(p_starts_on + v_pur.duration_days, 'DD.MM.YYYY')
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_mid;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.confirm_membership_purchase(uuid, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_membership_purchase(uuid, date, boolean) TO authenticated, service_role;

-- Trener menja placeno / nije placeno za potvrdjenu clanarinu. Placeno zadrzava prvi datum
-- uplate; nije placeno ga brise.
CREATE OR REPLACE FUNCTION public.trainer_set_purchase_paid(p_purchase_id uuid, p_paid boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trainer uuid := auth.uid();
  v_paid_at timestamptz;
BEGIN
  IF v_trainer IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni'; END IF;
  PERFORM public.require_active_trainer_sub();

  UPDATE public.membership_purchases
     SET paid_at = CASE WHEN COALESCE(p_paid, true) THEN COALESCE(paid_at, now()) END
   WHERE id = p_purchase_id AND trainer_id = v_trainer AND status = 'confirmed'
  RETURNING paid_at INTO v_paid_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Članarina ne postoji';
  END IF;

  RETURN jsonb_build_object('success', true, 'paid_at', v_paid_at);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trainer_set_purchase_paid(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_set_purchase_paid(uuid, boolean) TO authenticated, service_role;

-- Pregled clanarina nosi i da li je tekuca clanarina placena (paid je NULL kad clanarina
-- nije nastala iz zahteva, nego ju je trener uneo rucno).
CREATE OR REPLACE FUNCTION public.trainer_memberships_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trainer uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_trainer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT jsonb_build_object('success', true, 'memberships', coalesce(jsonb_agg(r.row), '[]'::jsonb))
    INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'membership_id', m.id,
      'athlete_id', a.id,
      'athlete_name', p.full_name,
      'avatar_url', p.avatar_url,
      'plan_name', m.plan_name,
      'price', m.price,
      'status', m.status::text,
      'starts_on', m.starts_on,
      'ends_on', m.ends_on,
      'days_left', CASE WHEN m.ends_on IS NULL THEN NULL ELSE (m.ends_on - now()::date) END,
      'sessions_total', m.sessions_total,
      'sessions_used', m.sessions_used,
      'sessions_left', CASE WHEN m.sessions_total IS NULL THEN NULL
                            ELSE m.sessions_total - coalesce(m.sessions_used, 0) END,
      'memberships_count', coalesce(mc.cnt, 0),
      'last_workout_at', w.last_workout_at,
      'days_since_last', CASE WHEN w.last_workout_at IS NULL THEN NULL
                              ELSE (now()::date - w.last_workout_at::date) END,
      'workouts_30d', coalesce(w.workouts_30d, 0),
      'risk', CASE
        WHEN w.last_workout_at IS NULL THEN 'high'
        WHEN now() - w.last_workout_at > interval '14 days' THEN 'high'
        WHEN now() - w.last_workout_at > interval '7 days' THEN 'medium'
        ELSE 'low'
      END,
      'purchase_id', mp.id,
      'paid', CASE WHEN mp.id IS NULL THEN NULL ELSE mp.paid_at IS NOT NULL END
    ) AS row
    FROM public.athletes a
    LEFT JOIN public.profiles p ON p.id = a.id
    LEFT JOIN LATERAL (
      SELECT mm.*
      FROM public.memberships mm
      WHERE mm.athlete_id = a.id
        AND mm.trainer_id = v_trainer
      ORDER BY (mm.status = 'active') DESC, mm.ends_on DESC NULLS LAST, mm.created_at DESC
      LIMIT 1
    ) m ON true
    LEFT JOIN public.membership_purchases mp
      ON mp.id = m.purchase_id AND mp.status = 'confirmed'
    LEFT JOIN LATERAL (
      SELECT count(*) AS cnt
      FROM public.memberships mm2
      WHERE mm2.athlete_id = a.id AND mm2.trainer_id = v_trainer
    ) mc ON true
    LEFT JOIN (
      SELECT athlete_id,
             max(completed_at) AS last_workout_at,
             count(*) FILTER (WHERE completed_at >= now() - interval '30 days') AS workouts_30d
      FROM public.workout_session_logs
      WHERE completed_at IS NOT NULL
      GROUP BY athlete_id
    ) w ON w.athlete_id = a.id
    WHERE a.trainer_id = v_trainer
    ORDER BY p.full_name NULLS LAST
  ) r;

  RETURN v_result;
END
$function$;

-- Admin: "placeno" znaci stvarno placeno.
CREATE OR REPLACE FUNCTION public.admin_trainer_athletes_detail(p_trainer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_admin');
  END IF;

  SELECT jsonb_build_object('success', true, 'athletes', coalesce(jsonb_agg(r.row), '[]'::jsonb))
    INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'athlete_id', a.id,
      'full_name', p.full_name,
      'avatar_url', p.avatar_url,
      'joined_at', a.joined_at,
      'last_workout_at', w.last_workout_at,
      'workouts_30d', coalesce(w.workouts_30d, 0),
      'risk', CASE
        WHEN w.last_workout_at IS NULL THEN 'high'
        WHEN now() - w.last_workout_at > interval '14 days' THEN 'high'
        WHEN now() - w.last_workout_at > interval '7 days' THEN 'medium'
        ELSE 'low'
      END,
      'membership', CASE WHEN m.id IS NULL THEN NULL ELSE jsonb_build_object(
        'plan_name', m.plan_name,
        'price', m.price,
        'status', m.status::text,
        'ends_on', m.ends_on,
        'days_left', CASE WHEN m.ends_on IS NULL THEN NULL ELSE (m.ends_on - now()::date) END,
        'sessions_total', m.sessions_total,
        'sessions_used', m.sessions_used
      ) END,
      'paid_count', coalesce(pc.paid_count, 0),
      'paid_total_rsd', coalesce(pc.paid_total_rsd, 0)
    ) AS row
    FROM public.athletes a
    LEFT JOIN public.profiles p ON p.id = a.id
    LEFT JOIN LATERAL (
      SELECT mm.* FROM public.memberships mm
      WHERE mm.athlete_id = a.id AND mm.trainer_id = p_trainer_id
      ORDER BY (mm.status = 'active') DESC, mm.ends_on DESC NULLS LAST, mm.created_at DESC
      LIMIT 1
    ) m ON true
    LEFT JOIN (
      SELECT athlete_id, max(completed_at) AS last_workout_at,
        count(*) FILTER (WHERE completed_at >= now() - interval '30 days') AS workouts_30d
      FROM public.workout_session_logs
      WHERE completed_at IS NOT NULL
      GROUP BY athlete_id
    ) w ON w.athlete_id = a.id
    LEFT JOIN (
      SELECT athlete_id, count(*) AS paid_count, sum(price_rsd) AS paid_total_rsd
      FROM public.membership_purchases
      WHERE trainer_id = p_trainer_id AND status = 'confirmed' AND paid_at IS NOT NULL
      GROUP BY athlete_id
    ) pc ON pc.athlete_id = a.id
    WHERE a.trainer_id = p_trainer_id
    ORDER BY p.full_name NULLS LAST
  ) r;

  RETURN v_result;
END;
$function$;
