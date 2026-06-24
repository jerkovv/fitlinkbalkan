ALTER TABLE public.workout_live_state
  ADD COLUMN IF NOT EXISTS la_push_token text,
  ADD COLUMN IF NOT EXISTS la_last_push_at timestamptz;

CREATE OR REPLACE FUNCTION public.athlete_set_la_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_rows int;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  UPDATE public.workout_live_state
    SET la_push_token = p_token
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
$function$;

GRANT EXECUTE ON FUNCTION public.athlete_set_la_token(text) TO authenticated, service_role;
