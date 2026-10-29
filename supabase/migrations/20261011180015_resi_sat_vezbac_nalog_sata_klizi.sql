-- Nalog sata (watch_pairing_tokens) je isticao tacno 30 dana posle uparivanja, ma koliko
-- se sat koristio: nijedna funkcija nije pomerala expires_at (samo last_used_at). Posle toga
-- sat vezbaca cuti, a trenerov trazi prijavu iako je telefon prijavljen.
-- Od sada rok klizi: nalog istice 30 dana posle POSLEDNJE upotrebe. Pomera se na mestima
-- kroz koja sat i telefon redovno prolaze: citanje stanja (watch_poll_state, u fajlu 02),
-- pocetno povezivanje (watch_get_user_context), svaki trenerov poziv (_watch_kao_trener) i
-- telefonovo uzimanje naloga (get_or_create_watch_token).
-- Vec istekli nalozi se NE ozivljavaju: telefon za njih dobija nov, kao i do sada.

CREATE OR REPLACE FUNCTION public.get_or_create_watch_token()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_token text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT token INTO v_token
  FROM watch_pairing_tokens
  WHERE user_id = v_user_id
    AND revoked_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token IS NULL THEN
    v_token := encode(extensions.gen_random_bytes(24), 'hex');

    INSERT INTO watch_pairing_tokens (user_id, token, created_at)
    VALUES (v_user_id, v_token, now());
  ELSE
    -- Telefon je otvoren i uzima nalog za sat: rok se pomera, najvise jednom dnevno.
    UPDATE watch_pairing_tokens
       SET expires_at = now() + interval '30 days'
     WHERE token = v_token
       AND expires_at < now() + interval '29 days';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'token', v_token,
    'user_id', v_user_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.watch_get_user_context(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_active_workout jsonb;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.watch_pairing_tokens
  WHERE token = p_token
    AND revoked_at IS NULL
    AND expires_at > now();

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Nalog koji se koristi ne istice: rok je 30 dana od poslednje upotrebe.
  UPDATE public.watch_pairing_tokens
  SET last_used_at = now(),
      expires_at = GREATEST(expires_at, now() + interval '30 days')
  WHERE token = p_token;

  SELECT jsonb_build_object(
    'user_id', v_user_id,
    'server_now_ms', (extract(epoch FROM now()) * 1000)::bigint,
    'active_workout', (
      SELECT row_to_json(s) FROM (
        SELECT
          wls.session_log_id AS session_id,
          wls.current_exercise_idx,
          wls.current_exercise_name,
          wls.current_set_number,
          wls.total_sets,
          wls.current_state,
          wls.current_hr,
          (extract(epoch FROM wls.rest_ends_at) * 1000)::bigint AS rest_ends_at_ms
        FROM public.workout_live_state wls
        WHERE wls.athlete_id = v_user_id
          AND wls.current_state IN ('active', 'rest')
          AND wls.last_heartbeat > now() - interval '5 minutes'
        ORDER BY wls.last_heartbeat DESC
        LIMIT 1
      ) s
    )
  ) INTO v_active_workout;

  RETURN v_active_workout;
END;
$function$;

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
  -- Nalog koji se koristi ne istice: rok je 30 dana od poslednje upotrebe. Trenerov sat
  -- zove ovo na svakih par sekundi, pa se upisuje najvise jednom dnevno.
  UPDATE public.watch_pairing_tokens
     SET expires_at = now() + interval '30 days', last_used_at = now()
   WHERE token = p_token AND expires_at < now() + interval '29 days';
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

-- Interna funkcija: niko je ne zove spolja (trenerove watch_trainer_* su SECURITY DEFINER).
REVOKE EXECUTE ON FUNCTION public._watch_kao_trener(text) FROM PUBLIC, anon, authenticated;
