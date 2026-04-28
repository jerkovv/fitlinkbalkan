-- =====================================================================
-- 26_at_risk_athletes.sql
-- RPC: get_at_risk_athletes(p_days int)
-- Vraća listu trener-ovih vežbača koji:
--   - imaju dodeljen aktivan program (assigned_programs.is_active)
--   - nisu odradili nijedan trening u poslednjih p_days dana
--     (ili nikad nisu trenirali a program im je dodeljen pre p_days dana)
--   - imaju aktivnu članarinu ILI nemaju nijednu (da uhvatimo i nove)
--   - nisu otkazali (athletes.is_active je TRUE ako kolona postoji; inače svi)
--
-- Plus: get_athlete_last_workout(p_athlete_id) za pojedinačnu proveru
-- (koristi se na vežbač strani za in-app nudge banner).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_at_risk_athletes(p_days int DEFAULT 4)
RETURNS TABLE (
  athlete_id uuid,
  full_name text,
  last_workout_at timestamptz,
  days_inactive int,
  has_active_program boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_athletes AS (
    SELECT a.id, a.joined_at
    FROM public.athletes a
    WHERE a.trainer_id = auth.uid()
  ),
  last_logs AS (
    SELECT
      l.athlete_id,
      MAX(l.completed_at) AS last_at
    FROM public.workout_session_logs l
    WHERE l.athlete_id IN (SELECT id FROM my_athletes)
      AND l.completed_at IS NOT NULL
    GROUP BY l.athlete_id
  ),
  active_progs AS (
    SELECT DISTINCT ap.athlete_id
    FROM public.assigned_programs ap
    WHERE ap.athlete_id IN (SELECT id FROM my_athletes)
      AND COALESCE(ap.is_active, true) = true
  )
  SELECT
    ma.id AS athlete_id,
    p.full_name,
    ll.last_at AS last_workout_at,
    CASE
      WHEN ll.last_at IS NULL THEN
        GREATEST(0, EXTRACT(DAY FROM (NOW() - ma.joined_at))::int)
      ELSE
        GREATEST(0, EXTRACT(DAY FROM (NOW() - ll.last_at))::int)
    END AS days_inactive,
    (ap.athlete_id IS NOT NULL) AS has_active_program
  FROM my_athletes ma
  LEFT JOIN public.profiles p ON p.id = ma.id
  LEFT JOIN last_logs ll ON ll.athlete_id = ma.id
  LEFT JOIN active_progs ap ON ap.athlete_id = ma.id
  WHERE
    -- ima aktivan program
    ap.athlete_id IS NOT NULL
    AND (
      -- nikad nije trenirao a član je duže od p_days
      (ll.last_at IS NULL AND ma.joined_at < NOW() - (p_days || ' days')::interval)
      OR
      -- ili poslednji trening je stariji od p_days
      (ll.last_at IS NOT NULL AND ll.last_at < NOW() - (p_days || ' days')::interval)
    )
  ORDER BY days_inactive DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_at_risk_athletes(int) TO authenticated;

-- ---------------------------------------------------------------------
-- Pojedinačna provera za vežbača (za nudge banner)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_athlete_last_workout(p_athlete_id uuid)
RETURNS TABLE (
  last_workout_at timestamptz,
  days_inactive int,
  has_active_program boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT MAX(completed_at) FROM public.workout_session_logs
       WHERE athlete_id = p_athlete_id AND completed_at IS NOT NULL) AS last_workout_at,
    GREATEST(0, EXTRACT(DAY FROM (NOW() - COALESCE(
      (SELECT MAX(completed_at) FROM public.workout_session_logs
        WHERE athlete_id = p_athlete_id AND completed_at IS NOT NULL),
      (SELECT joined_at FROM public.athletes WHERE id = p_athlete_id)
    )))::int) AS days_inactive,
    EXISTS(
      SELECT 1 FROM public.assigned_programs
      WHERE athlete_id = p_athlete_id AND COALESCE(is_active, true) = true
    ) AS has_active_program;
$$;

GRANT EXECUTE ON FUNCTION public.get_athlete_last_workout(uuid) TO authenticated;
