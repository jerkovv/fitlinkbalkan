-- Tabela za trenerov Live Activity token/stanje
CREATE TABLE IF NOT EXISTS public.trainer_live_activity (
  trainer_id   uuid PRIMARY KEY,
  push_token   text,
  active       boolean NOT NULL DEFAULT false,
  started_at   timestamptz,
  last_push_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trainer_live_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trainer_la_self ON public.trainer_live_activity;
CREATE POLICY trainer_la_self ON public.trainer_live_activity
  FOR ALL TO authenticated
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid());

-- Agregat: trener -> aktivni vezbaci (top 3 po pulsu) + activeCount + moreCount
CREATE OR REPLACE FUNCTION public.trainer_live_content(p_trainer_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH active AS (
  SELECT
    COALESCE(p.full_name, 'Vezbac') AS name,
    wls.current_hr AS hr,
    wls.current_state,
    CASE
      WHEN wls.current_hr IS NULL OR wls.current_hr <= 0 THEN 'rest'
      WHEN wls.current_hr < 110 THEN 'easy'
      WHEN wls.current_hr < 140 THEN 'moderate'
      WHEN wls.current_hr < 165 THEN 'hard'
      ELSE 'max'
    END AS zone
  FROM public.workout_live_state wls
  JOIN public.athletes a ON a.id = wls.athlete_id
  LEFT JOIN public.profiles p ON p.id = wls.athlete_id
  WHERE a.trainer_id = p_trainer_id
    AND wls.current_state IN ('active','rest')
    AND wls.last_heartbeat > now() - interval '5 minutes'
),
ranked AS (
  SELECT active.*,
         row_number() OVER (ORDER BY hr DESC NULLS LAST) AS rn,
         count(*) OVER () AS total
  FROM active
)
SELECT jsonb_build_object(
  'athletes', COALESCE((
     SELECT jsonb_agg(jsonb_build_object(
        'name', name,
        'hr', hr,
        'zone', zone,
        'isResting', (current_state = 'rest')
     ) ORDER BY rn)
     FROM ranked WHERE rn <= 3
  ), '[]'::jsonb),
  'activeCount', COALESCE((SELECT max(total) FROM ranked), 0),
  'moreCount', GREATEST(COALESCE((SELECT max(total) FROM ranked), 0) - 3, 0)
);
$function$;

-- RPC: start (oznaci aktivno, vrati pocetni sadrzaj)
CREATE OR REPLACE FUNCTION public.trainer_la_start()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  INSERT INTO public.trainer_live_activity (trainer_id, active, started_at, last_push_at, updated_at)
    VALUES (v_user, true, now(), NULL, now())
  ON CONFLICT (trainer_id) DO UPDATE
    SET active = true, started_at = now(), last_push_at = NULL, updated_at = now();
  RETURN jsonb_build_object('success', true, 'content', public.trainer_live_content(v_user));
END
$function$;

-- RPC: upisi push token
CREATE OR REPLACE FUNCTION public.trainer_set_la_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  UPDATE public.trainer_live_activity
    SET push_token = p_token, updated_at = now()
  WHERE trainer_id = v_user;
  IF NOT FOUND THEN
    INSERT INTO public.trainer_live_activity (trainer_id, push_token, active, started_at, updated_at)
      VALUES (v_user, p_token, true, now(), now());
  END IF;
  RETURN jsonb_build_object('success', true);
END
$function$;

-- RPC: stop
CREATE OR REPLACE FUNCTION public.trainer_la_stop()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  UPDATE public.trainer_live_activity
    SET active = false, push_token = NULL, updated_at = now()
  WHERE trainer_id = v_user;
  RETURN jsonb_build_object('success', true);
END
$function$;

-- RPC: poll sadrzaj (dok je app otvorena)
CREATE OR REPLACE FUNCTION public.trainer_la_content()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.trainer_live_content(auth.uid());
$function$;

GRANT EXECUTE ON FUNCTION public.trainer_la_start() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trainer_set_la_token(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trainer_la_stop() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trainer_la_content() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trainer_live_content(uuid) TO authenticated, service_role;
