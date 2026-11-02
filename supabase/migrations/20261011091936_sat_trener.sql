-- Sat za trenera. Sat nema prijavu: predstavlja se nalogom za sat (watch_pairing_tokens),
-- isto kao kod vezbaca. _watch_kao_trener proveri nalog i ulogu, pa do kraja poziva
-- postavi identitet trenera, tako da postojece trenerske funkcije (koje citaju auth.uid()
-- i same proveravaju pretplatu i pripadnost vezbaca) rade bez kopiranja svoje logike.

CREATE OR REPLACE FUNCTION public._watch_kao_trener(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid;
BEGIN
  SELECT user_id INTO v_uid FROM public.watch_pairing_tokens
   WHERE token = p_token AND revoked_at IS NULL AND expires_at > now();
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'trainer') THEN
    RETURN NULL;
  END IF;
  -- Vazi samo do kraja ove transakcije (treci argument true), dakle samo za ovaj poziv.
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
  PERFORM set_config('request.jwt.claims',
                     jsonb_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);
  RETURN v_uid;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._watch_kao_trener(text) FROM PUBLIC, anon, authenticated;

-- Ko trenira sada: isti spisak kao na telefonu, uz cilj tekuce serije i broj zahteva na cekanju.
CREATE OR REPLACE FUNCTION public.watch_trainer_live(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_t uuid := public._watch_kao_trener(p_token);
  v_sada timestamptz := now();
BEGIN
  IF v_t IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  IF NOT public.trainer_has_active_fitlink_sub(v_t) THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'server_now_ms', (extract(epoch FROM v_sada) * 1000)::bigint,
    'pending_requests', (SELECT count(*) FROM public.membership_purchases mp
                          WHERE mp.trainer_id = v_t AND mp.status = 'pending'),
    'athletes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'athlete_id', x.athlete_id,
        'name', x.athlete_name,
        'session_id', x.session_id,
        'started_at_ms', (extract(epoch FROM x.started_at) * 1000)::bigint,
        'exercise', x.current_exercise_name,
        'set', x.current_set_number,
        'total_sets', wls.total_sets,
        'target', public._la_cilj_serije(x.session_id, wls.current_exercise_idx,
                                         x.current_set_number, x.rest_ends_at) ->> 'weightText',
        'hr', x.current_hr,
        -- Puls vazi samo dok je svez (40 s), isto pravilo kao na telefonu.
        'hr_fresh', GREATEST(COALESCE(x.hr_last_at, 'epoch'::timestamptz),
                             COALESCE(x.watch_last_hr_at, 'epoch'::timestamptz)) > v_sada - interval '40 seconds',
        'zone', x.hr_zone,
        'state', x.current_state,
        'rest_ends_at_ms', (extract(epoch FROM x.rest_ends_at) * 1000)::bigint,
        'kcal', round(x.current_active_calories)::int,
        'last_heartbeat_ms', (extract(epoch FROM x.last_heartbeat) * 1000)::bigint
      ) ORDER BY x.started_at DESC)
      FROM public.get_active_athletes_for_trainer() x
      LEFT JOIN public.workout_live_state wls ON wls.session_log_id = x.session_id
    ), '[]'::jsonb)
  );
END;
$function$;

-- Brza poruka vezbacu tokom treninga (stize i na njegov sat).
CREATE OR REPLACE FUNCTION public.watch_trainer_send_message(
  p_token text, p_session_id uuid, p_message text, p_message_type text DEFAULT 'text')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_t uuid := public._watch_kao_trener(p_token);
  v_id uuid;
BEGIN
  IF v_t IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  BEGIN
    v_id := public.send_workout_message(p_session_id, p_message, p_message_type);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$function$;

-- Zaustavljanje sesije koja je ostala ukljucena.
CREATE OR REPLACE FUNCTION public.watch_trainer_finish_workout(p_token text, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_t uuid := public._watch_kao_trener(p_token);
  v_o jsonb;
BEGIN
  IF v_t IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  BEGIN
    v_o := public.trainer_finish_workout(p_session_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
  RETURN COALESCE(v_o, '{}'::jsonb) || jsonb_build_object('success', COALESCE((v_o ->> 'success')::boolean, true));
END;
$function$;

-- Trenerov dan: termini sa prijavljenim vezbacima i stanjem njihove clanarine.
-- Dan se racuna po Beogradu, a pocetak termina kroz _pocetak_termina.
CREATE OR REPLACE FUNCTION public.watch_trainer_day(p_token text, p_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_t uuid := public._watch_kao_trener(p_token);
  v_dan date := COALESCE(p_date, (now() AT TIME ZONE 'Europe/Belgrade')::date);
BEGIN
  IF v_t IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  IF NOT public.trainer_has_active_fitlink_sub(v_t) THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'date', v_dan,
    'server_now_ms', (extract(epoch FROM now()) * 1000)::bigint,
    'pending_requests', (SELECT count(*) FROM public.membership_purchases mp
                          WHERE mp.trainer_id = v_t AND mp.status = 'pending'),
    'slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type_name', s.type_name,
        'color', s.type_color,
        'start_time', to_char(s.start_time, 'HH24:MI'),
        'starts_at_ms', (extract(epoch FROM public._pocetak_termina(v_dan, s.start_time)) * 1000)::bigint,
        'duration_min', s.duration_min,
        'capacity', s.capacity,
        'booked', s.booked_count,
        'athletes', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'athlete_id', sb.athlete_id,
                   'name', p.full_name,
                   'sessions_used', m.sessions_used,
                   'sessions_total', m.sessions_total
                 ) ORDER BY p.full_name), '[]'::jsonb)
          FROM public.session_bookings sb
          JOIN public.profiles p ON p.id = sb.athlete_id
          LEFT JOIN LATERAL (
            SELECT mm.sessions_used, mm.sessions_total FROM public.memberships mm
             WHERE mm.athlete_id = sb.athlete_id AND mm.trainer_id = v_t AND mm.status = 'active'
             ORDER BY mm.created_at DESC LIMIT 1
          ) m ON true
          WHERE sb.trainer_id = v_t AND sb.date = v_dan AND sb.start_time = s.start_time
            AND sb.session_type_id = s.session_type_id AND sb.status = 'booked'
        )
      ) ORDER BY s.start_time)
      FROM public.get_day_slots(v_t, v_dan) s
      WHERE NOT s.is_canceled
    ), '[]'::jsonb)
  );
END;
$function$;

-- Zahtevi za clanarinu koji cekaju trenerovu potvrdu.
CREATE OR REPLACE FUNCTION public.watch_trainer_requests(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_t uuid := public._watch_kao_trener(p_token);
BEGIN
  IF v_t IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  IF NOT public.trainer_has_active_fitlink_sub(v_t) THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription');
  END IF;
  RETURN jsonb_build_object(
    'success', true,
    'requests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', mp.id,
        'athlete_id', mp.athlete_id,
        'name', p.full_name,
        'package', mp.package_name,
        'sessions', mp.sessions_count,
        'days', mp.duration_days,
        'price_rsd', mp.price_rsd,
        'payment_method', mp.payment_method,
        'paid_marked', mp.payment_marked_at IS NOT NULL,
        'requested_at_ms', (extract(epoch FROM mp.requested_at) * 1000)::bigint
      ) ORDER BY mp.requested_at)
      FROM public.membership_purchases mp
      JOIN public.profiles p ON p.id = mp.athlete_id
      WHERE mp.trainer_id = v_t AND mp.status = 'pending'
    ), '[]'::jsonb)
  );
END;
$function$;

-- Potvrda ili odbijanje zahteva sa zgloba; clanarina krece od danasnjeg dana po Beogradu.
CREATE OR REPLACE FUNCTION public.watch_trainer_decide_request(
  p_token text, p_purchase_id uuid, p_confirm boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_t uuid := public._watch_kao_trener(p_token);
BEGIN
  IF v_t IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  BEGIN
    IF p_confirm THEN
      PERFORM public.confirm_membership_purchase(p_purchase_id, (now() AT TIME ZONE 'Europe/Belgrade')::date);
    ELSE
      PERFORM public.reject_membership_purchase(p_purchase_id, NULL);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
  RETURN jsonb_build_object('success', true);
END;
$function$;
