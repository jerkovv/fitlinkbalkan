-- Trener spaja vezbe u superset USRED treninga, i raskida ga.
--
-- Superset ima smisla samo za UZASTOPNE vezbe: motor redja blokove po najmanjoj
-- poziciji u bloku, pa bi grupa 1+4 povukla cetvrtu vezbu na drugo mesto i
-- ostavila 2 i 3 iza nje - trener bi dobio redosled koji nije trazio. Zato se
-- clanovi PREMESTAJU da budu uzastopni, na mesto prvog od njih.
--
-- Vezba koja vec ima upisanu seriju ne moze u superset: spajanje menja redosled,
-- a odradjeni deo treninga se ne prerasporedjuje unazad. Isto pravilo vec vazi
-- za brisanje vezbe.
CREATE OR REPLACE FUNCTION public.trainer_set_superset(
  p_session_id uuid,
  p_ape_ids    uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_athlete uuid; v_meta uuid[]; v_grupa smallint; v_sa_serijama int; v_prva int;
BEGIN
  v_athlete := public._trainer_session_guard(p_session_id);

  IF p_ape_ids IS NULL OR array_length(p_ape_ids, 1) IS NULL
     OR array_length(p_ape_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Superset trazi bar dve vezbe';
  END IF;
  IF array_length(p_ape_ids, 1) > 5 THEN
    RAISE EXCEPTION 'Najvise pet vezbi u jednom krugu';
  END IF;

  PERFORM public._fork_session_plan(p_session_id);

  SELECT array_agg(public._session_ape(p_session_id, x.id)) INTO v_meta
  FROM unnest(p_ape_ids) AS x(id);
  IF v_meta IS NULL OR array_position(v_meta, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Vezba nije u ovom treningu';
  END IF;

  SELECT count(*) INTO v_sa_serijama
  FROM public.set_logs sl
  WHERE sl.session_log_id = p_session_id AND sl.exercise_id = ANY(v_meta);
  IF v_sa_serijama > 0 THEN
    RAISE EXCEPTION 'Vezba koja vec ima upisanu seriju ne moze u superset';
  END IF;

  SELECT COALESCE(max(superset_group), 0) + 1 INTO v_grupa
  FROM public.assigned_program_exercises WHERE session_log_id = p_session_id;

  SELECT min(position) INTO v_prva
  FROM public.assigned_program_exercises
  WHERE id = ANY(v_meta);

  -- Novi redosled: sve po staroj poziciji, ali clanovi kruga skupljeni na mesto
  -- prvog od njih. Sortni kljuc je (mesto bloka, pa da li je clan, pa stara poz).
  WITH novi AS (
    SELECT ape.id,
           row_number() OVER (
             ORDER BY CASE WHEN ape.id = ANY(v_meta) THEN v_prva ELSE ape.position END,
                      CASE WHEN ape.id = ANY(v_meta) THEN 0 ELSE 1 END,
                      ape.position
           ) AS nova_poz
    FROM public.assigned_program_exercises ape
    WHERE ape.session_log_id = p_session_id AND ape.deleted_at IS NULL
  )
  UPDATE public.assigned_program_exercises ape
  SET position = novi.nova_poz,
      superset_group = CASE WHEN ape.id = ANY(v_meta) THEN v_grupa ELSE ape.superset_group END
  FROM novi
  WHERE ape.id = novi.id;

  RETURN public._trainer_resync_live(p_session_id, v_athlete)
         || jsonb_build_object('superset_group', v_grupa, 'clanova', array_length(v_meta, 1));
END;
$$;

-- Raskidanje: skida grupu sa CELOG kruga u kome je data vezba, ne samo sa nje -
-- krug od jednog clana nije krug.
CREATE OR REPLACE FUNCTION public.trainer_clear_superset(
  p_session_id uuid,
  p_ape_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_athlete uuid; v_ape uuid; v_grupa smallint; v_rows int;
BEGIN
  v_athlete := public._trainer_session_guard(p_session_id);

  PERFORM public._fork_session_plan(p_session_id);
  v_ape := public._session_ape(p_session_id, p_ape_id);
  IF v_ape IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u ovom treningu'; END IF;

  SELECT superset_group INTO v_grupa
  FROM public.assigned_program_exercises WHERE id = v_ape;
  IF v_grupa IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u supersetu'; END IF;

  UPDATE public.assigned_program_exercises
  SET superset_group = NULL
  WHERE session_log_id = p_session_id AND superset_group = v_grupa;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN public._trainer_resync_live(p_session_id, v_athlete)
         || jsonb_build_object('razdvojeno', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.trainer_set_superset(uuid, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trainer_set_superset(uuid, uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.trainer_clear_superset(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trainer_clear_superset(uuid, uuid) TO authenticated;
