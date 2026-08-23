-- Sat mora da dobije superset_group, inace ne moze da napravi krugove i njegov
-- lokalni motor ostaje "vezba po vezba" dok server vozi "korak po korak".
-- Ovo je jedina serverska izmena koja satu nedostaje; sve ostalo (mesto u krugu,
-- velicina kruga) sat izvodi lokalno iz plana, jer to nisu svojstva vezbe nego
-- KORAKA i menjaju se po krugu kad clan sa manje serija ispadne.
DO $$
DECLARE v_src text; v_new text; v_vol char;
BEGIN
  SELECT p.prosrc, p.provolatile INTO v_src, v_vol
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'watch_get_workout_plan';

  -- u CTE "plan"
  v_new := replace(v_src,
'    SELECT ape.id AS ape_id,
           ape.position,',
'    SELECT ape.id AS ape_id,
           ape.position,
           ape.superset_group,');

  IF v_new = v_src THEN
    RAISE EXCEPTION 'watch_get_workout_plan: CTE plan nije nadjen';
  END IF;

  -- u izlazni jsonb
  v_new := replace(v_new,
$q$        'ape_id', m.ape_id,$q$,
$q$        'ape_id', m.ape_id,
        'superset_group', m.superset_group,$q$);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.watch_get_workout_plan(p_token text, p_session_id uuid)
     RETURNS jsonb LANGUAGE plpgsql %s SECURITY DEFINER SET search_path TO ''public'' AS %L',
    CASE v_vol WHEN 's' THEN 'STABLE' WHEN 'i' THEN 'IMMUTABLE' ELSE '' END,
    v_new);
END $$;
