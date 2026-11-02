-- Već primenjeno na bazu preko MCP; ovaj fajl je samo za version control.
--
-- Dve aplikacije, dva paketa: prodavnicka (rs.fitlink.app) i nativna
-- (rs.fitlink.app.native). APNs temu pravi paket, a send-push i send-la-push su
-- do sada uzimali jedan APNS_BUNDLE_ID iz okruzenja, pa nijedan push nije mogao
-- da stigne nativnoj aplikaciji. Naziv paketa sada putuje uz sam znak uredjaja.

ALTER TABLE public.device_push_tokens
  ADD COLUMN IF NOT EXISTS bundle text NOT NULL DEFAULT 'rs.fitlink.app';

ALTER TABLE public.workout_live_state
  ADD COLUMN IF NOT EXISTS la_bundle text;

ALTER TABLE public.trainer_live_activity
  ADD COLUMN IF NOT EXISTS bundle text;

-- Stara verzija sa jednim argumentom se brise: sa dodatim podrazumevanim
-- argumentom bi PostgREST imao dva kandidata za isti poziv {p_token}.
DROP FUNCTION IF EXISTS public.athlete_set_la_token(text);
CREATE OR REPLACE FUNCTION public.athlete_set_la_token(p_token text, p_bundle text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_rows int;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  UPDATE public.workout_live_state
    SET la_push_token = p_token,
        la_bundle = COALESCE(NULLIF(btrim(COALESCE(p_bundle, '')), ''), 'rs.fitlink.app')
  WHERE session_log_id = (
    SELECT w2.session_log_id
    FROM public.workout_live_state w2
    WHERE w2.athlete_id = v_user
      AND w2.current_state IN ('active','rest')
    ORDER BY w2.last_heartbeat DESC
    LIMIT 1
  );

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'updated', v_rows);
END
$$;
REVOKE EXECUTE ON FUNCTION public.athlete_set_la_token(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.athlete_set_la_token(text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.trainer_set_la_token(text);
CREATE OR REPLACE FUNCTION public.trainer_set_la_token(p_token text, p_bundle text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  INSERT INTO public.trainer_live_activity (trainer_id, push_token, bundle, active, updated_at)
  VALUES (v_user, p_token,
          COALESCE(NULLIF(btrim(COALESCE(p_bundle, '')), ''), 'rs.fitlink.app'), true, now())
  ON CONFLICT (trainer_id) DO UPDATE
    SET push_token = EXCLUDED.push_token,
        bundle = EXCLUDED.bundle,
        updated_at = now();

  RETURN jsonb_build_object('success', true);
END
$$;
REVOKE EXECUTE ON FUNCTION public.trainer_set_la_token(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_set_la_token(text, text) TO authenticated;

-- Trigeri koji guraju Live Activity sada nose 'bundle' u telu poziva ka
-- send-la-push; pune definicije su u sledecoj migraciji (_trigeri).
