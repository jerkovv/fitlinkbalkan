-- "Prosli put" po vezbi: sta je vezbac poslednji put uradio za svaku od
-- trazenih vezbi. Osnova za progresivno opterecenje - i trener i vezbac treba
-- da vide broj od proslog puta pre nego sto upisu danasnji.
--
-- Zasto join preko assigned_program_exercises: set_logs.exercise_id NE pokazuje
-- na katalog vezbi nego na red u programu tog vezbaca. Isti bench iz dva
-- razlicita programa su dva razlicita reda, pa se istorija mora razresiti na
-- PRAVU vezbu iz kataloga, inace se prekida svaki put kad trener dodeli nov
-- program.
--
-- Uzimaju se samo ZAVRSENE sesije, cime se sam od sebe iskljucuje trening koji
-- je bas u toku - inace bi "prosli put" pokazivao setove od pre minut.
--
-- NE filtrira se po tezini: set bez upisane kilaze (weight_kg NULL) ili sa 0
-- (sopstvena tezina - zgib, sklek) je i dalje odradjen set i "prosli put 3x12"
-- je korisna informacija. Klijent odlucuje da li ce uz ponavljanja prikazati
-- i kg (kad ih ima).
CREATE OR REPLACE FUNCTION public.get_last_exercise_performance(
  p_athlete_id  uuid,
  p_exercise_ids uuid[]
)
RETURNS TABLE(
  exercise_id     uuid,
  performed_at    timestamptz,
  sets            jsonb,
  top_weight_kg   numeric,
  best_weight_kg  numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Niste prijavljeni';
  END IF;

  -- Sam vezbac, njegov trener, ili admin. Bez ovoga bi SECURITY DEFINER pustio
  -- bilo koga da procita tudju istoriju treninga.
  IF auth.uid() <> p_athlete_id
     AND NOT public.is_my_athlete(auth.uid(), p_athlete_id)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Nemate pristup ovom vezbacu';
  END IF;

  RETURN QUERY
  WITH trazene AS (
    SELECT DISTINCT unnest(p_exercise_ids) AS ex_id
  ),
  istorija AS (
    SELECT ape.exercise_id                          AS ex_id,
           w.id                                     AS session_id,
           COALESCE(w.completed_at, w.started_at)   AS kada,
           sl.set_number,
           sl.reps,
           sl.weight_kg
    FROM public.set_logs sl
    JOIN public.workout_session_logs w         ON w.id = sl.session_log_id
    JOIN public.assigned_program_exercises ape ON ape.id = sl.exercise_id
    WHERE w.athlete_id = p_athlete_id
      AND w.completed_at IS NOT NULL
      AND sl.done = true
      AND ape.exercise_id = ANY(p_exercise_ids)
  ),
  poslednja AS (
    SELECT DISTINCT ON (i.ex_id) i.ex_id, i.session_id, i.kada
    FROM istorija i
    ORDER BY i.ex_id, i.kada DESC
  )
  SELECT
    t.ex_id,
    p.kada,
    COALESCE(
      (SELECT jsonb_agg(
                jsonb_build_object(
                  'set_number', i.set_number,
                  'reps',       i.reps,
                  'weight_kg',  i.weight_kg
                ) ORDER BY i.set_number)
         FROM istorija i
        WHERE i.ex_id = t.ex_id AND i.session_id = p.session_id),
      '[]'::jsonb),
    (SELECT max(i.weight_kg)
       FROM istorija i
      WHERE i.ex_id = t.ex_id AND i.session_id = p.session_id),
    (SELECT pr.best_weight_kg
       FROM public.personal_records pr
      WHERE pr.athlete_id = p_athlete_id AND pr.exercise_id = t.ex_id)
  FROM trazene t
  LEFT JOIN poslednja p ON p.ex_id = t.ex_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_last_exercise_performance(uuid, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_last_exercise_performance(uuid, uuid[]) TO authenticated;
