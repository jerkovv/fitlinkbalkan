-- Već primenjeno na bazu preko MCP; ovaj fajl je samo za version control.
--
-- Trener menja redosled vezbi u zivom treningu (npr. nova vezba na prvo mesto
-- ili odmah posle tekuce). Klijent salje CEO spisak u novom redosledu; server
-- proverava da je spisak potpun i da superset ostaje na okupu, pa preracuna
-- poziciju (_trainer_resync_live podize plan_version, telefon i sat se osveze).
CREATE OR REPLACE FUNCTION public.trainer_reorder_exercises(p_session_id uuid, p_ape_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_athlete uuid;
  v_meta uuid[];
  v_broj int;
  v_razbijen int;
BEGIN
  v_athlete := public._trainer_session_guard(p_session_id);

  IF p_ape_ids IS NULL OR array_length(p_ape_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Nije poslat redosled vezbi';
  END IF;

  PERFORM public._fork_session_plan(p_session_id);

  -- Id-jevi iz plana dana se prevode u vezbe ove sesije (posle forka).
  SELECT array_agg(public._session_ape(p_session_id, x.id) ORDER BY x.ord) INTO v_meta
  FROM unnest(p_ape_ids) WITH ORDINALITY AS x(id, ord);
  IF v_meta IS NULL OR array_position(v_meta, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Vezba nije u ovom treningu';
  END IF;

  SELECT count(*) INTO v_broj
  FROM public.assigned_program_exercises
  WHERE session_log_id = p_session_id AND deleted_at IS NULL;

  IF v_broj <> array_length(v_meta, 1)
     OR (SELECT count(DISTINCT x) FROM unnest(v_meta) AS x) <> v_broj THEN
    RAISE EXCEPTION 'Redosled mora da sadrzi sve vezbe treninga';
  END IF;

  -- Superset se radi u krugu, pa njegovi clanovi moraju ostati jedan do drugog.
  WITH r AS (
    SELECT x.ord, ape.superset_group AS g
    FROM unnest(v_meta) WITH ORDINALITY AS x(id, ord)
    JOIN public.assigned_program_exercises ape ON ape.id = x.id
  )
  SELECT count(*) INTO v_razbijen
  FROM (
    SELECT g, max(ord) - min(ord) + 1 AS raspon, count(*) AS n
    FROM r WHERE g IS NOT NULL GROUP BY g
  ) q
  WHERE q.raspon <> q.n;
  IF v_razbijen > 0 THEN
    RAISE EXCEPTION 'Superset mora da ostane na okupu';
  END IF;

  UPDATE public.assigned_program_exercises ape
  SET position = x.ord
  FROM unnest(v_meta) WITH ORDINALITY AS x(id, ord)
  WHERE ape.id = x.id;

  RETURN public._trainer_resync_live(p_session_id, v_athlete)
         || jsonb_build_object('reordered', v_broj);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trainer_reorder_exercises(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_reorder_exercises(uuid, uuid[]) TO authenticated;
