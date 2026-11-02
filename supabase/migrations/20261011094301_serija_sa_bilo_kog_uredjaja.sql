-- Sat i telefon vode isti trening uporedo ("jedna glava"). Do sada je telefon bio zakljucan
-- dok sat vozi, jer _engine_complete_set upisuje seriju na TEKUCU poziciju servera: dva
-- dodira za istu seriju sa dva uredjaja upisala bi dve serije.
-- Nove funkcije primaju poziciju koju uredjaj vidi (vezba i serija). Ako je server vec
-- otisao dalje, serija je upisana sa drugog uredjaja i poziv ne radi nista.
-- Stare funkcije (athlete_complete_set, watch_complete_set) ostaju netaknute za
-- aplikaciju iz prodavnice i staru watch aplikaciju.

CREATE OR REPLACE FUNCTION public._engine_complete_set_na(
  p_user_id uuid, p_session_id uuid, p_exercise_idx integer, p_set_number integer,
  p_reps integer, p_weight numeric, p_rpe numeric, p_duration_minutes integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_pos jsonb; v_stanje text;
BEGIN
  -- Brava po sesiji: dva uredjaja koja u istom trenutku javljaju istu seriju cekaju jedan
  -- drugog, pa drugi vidi poziciju posle prvog.
  SELECT current_state INTO v_stanje FROM public.workout_live_state
   WHERE session_log_id = p_session_id AND athlete_id = p_user_id
   FOR UPDATE;

  IF p_exercise_idx IS NOT NULL AND p_set_number IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.workout_session_logs
                  WHERE id = p_session_id AND athlete_id = p_user_id AND is_active = true) THEN
    v_pos := public.watch_compute_position(p_session_id);
    IF NOT COALESCE((v_pos->>'complete')::boolean, false)
       AND ((v_pos->>'exercise_idx')::int IS DISTINCT FROM p_exercise_idx
            OR (v_pos->>'set_number')::int IS DISTINCT FROM p_set_number) THEN
      RETURN jsonb_build_object('success', true, 'note', 'already_logged',
                                'state', COALESCE(v_stanje, 'active'), 'position', v_pos);
    END IF;
  END IF;

  RETURN public._engine_complete_set(p_user_id, p_session_id, p_reps, p_weight, p_rpe, p_duration_minutes);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._engine_complete_set_na(uuid, uuid, integer, integer, integer, numeric, numeric, integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.athlete_complete_set_at(
  p_session_id uuid, p_exercise_idx integer, p_set_number integer,
  p_reps integer DEFAULT NULL, p_weight numeric DEFAULT NULL, p_rpe numeric DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  RETURN public._engine_complete_set_na(v_user_id, p_session_id, p_exercise_idx, p_set_number,
                                        p_reps, p_weight, p_rpe, p_duration_minutes);
END;
$function$;

CREATE OR REPLACE FUNCTION public.watch_complete_set_at(
  p_token text, p_session_id uuid, p_exercise_idx integer, p_set_number integer,
  p_reps integer DEFAULT NULL, p_weight numeric DEFAULT NULL, p_rpe numeric DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM public.watch_pairing_tokens
   WHERE token = p_token AND revoked_at IS NULL AND expires_at > now();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'invalid_token'); END IF;
  RETURN public._engine_complete_set_na(v_user_id, p_session_id, p_exercise_idx, p_set_number,
                                        p_reps, p_weight, p_rpe, p_duration_minutes);
END;
$function$;
