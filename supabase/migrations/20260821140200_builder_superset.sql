-- SUPERSET u builderu: trener spaja vezbe JOS DOK PRAVI plan, ne tek uzivo.
--
-- Isti par funkcija pokriva obe grane buildera (sablon i dodeljen program), jer
-- se ekran ne razlikuje - razlikuje se samo tabela. Opseg je zato parametar, a
-- ne dve skoro iste funkcije.
--
-- UZASTOPNOST JE INVARIJANTA: motor redja blokove po NAJMANJOJ poziciji u bloku,
-- pa krug cije vezbe nisu jedna uz drugu i dalje "radi", ali izvlaci daleku
-- vezbu napred - trener bi video jedno a vezbac dobio drugo. Zato spajanje samo
-- ne oznaci vezbe nego ih i PREMESTI jednu uz drugu, na mesto prve od njih.
CREATE OR REPLACE FUNCTION public.builder_set_superset(p_scope text, p_day_id uuid, p_ex_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_grupa smallint; v_prva int; v_ima int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni'; END IF;
  PERFORM public.require_active_trainer_sub();
  IF p_scope NOT IN ('template', 'assigned') THEN
    RAISE EXCEPTION 'Nepoznat opseg';
  END IF;
  IF p_ex_ids IS NULL OR array_length(p_ex_ids, 1) IS NULL OR array_length(p_ex_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Superset trazi bar dve vezbe';
  END IF;
  IF array_length(p_ex_ids, 1) > 5 THEN
    RAISE EXCEPTION 'Najvise pet vezbi u jednom krugu';
  END IF;

  IF p_scope = 'template' THEN
    -- Vlasnistvo ide kroz sablon; RLS na tabeli i dalje vazi jer proveravamo rucno.
    IF NOT EXISTS (
      SELECT 1 FROM public.program_template_days d
      JOIN public.program_templates t ON t.id = d.template_id
      WHERE d.id = p_day_id AND t.trainer_id = auth.uid()
    ) THEN RAISE EXCEPTION 'Nije tvoj sablon'; END IF;

    SELECT count(*) INTO v_ima FROM public.program_template_exercises
    WHERE day_id = p_day_id AND id = ANY(p_ex_ids);
    IF v_ima <> array_length(p_ex_ids, 1) THEN RAISE EXCEPTION 'Vezba nije u ovom danu'; END IF;

    SELECT COALESCE(max(superset_group), 0) + 1 INTO v_grupa
    FROM public.program_template_exercises WHERE day_id = p_day_id;
    SELECT min(position) INTO v_prva
    FROM public.program_template_exercises WHERE id = ANY(p_ex_ids);

    WITH novi AS (
      SELECT te.id,
             row_number() OVER (
               ORDER BY CASE WHEN te.id = ANY(p_ex_ids) THEN v_prva ELSE te.position END,
                        CASE WHEN te.id = ANY(p_ex_ids) THEN 0 ELSE 1 END,
                        te.position
             ) AS nova_poz
      FROM public.program_template_exercises te WHERE te.day_id = p_day_id
    )
    UPDATE public.program_template_exercises te
    SET position = novi.nova_poz,
        superset_group = CASE WHEN te.id = ANY(p_ex_ids) THEN v_grupa ELSE te.superset_group END
    FROM novi WHERE te.id = novi.id;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.assigned_program_days d
      JOIN public.assigned_programs p ON p.id = d.assigned_program_id
      WHERE d.id = p_day_id AND p.trainer_id = auth.uid()
    ) THEN RAISE EXCEPTION 'Nije tvoj program'; END IF;

    SELECT count(*) INTO v_ima FROM public.assigned_program_exercises
    WHERE day_id = p_day_id AND id = ANY(p_ex_ids) AND deleted_at IS NULL;
    IF v_ima <> array_length(p_ex_ids, 1) THEN RAISE EXCEPTION 'Vezba nije u ovom danu'; END IF;

    SELECT COALESCE(max(superset_group), 0) + 1 INTO v_grupa
    FROM public.assigned_program_exercises WHERE day_id = p_day_id;
    SELECT min(position) INTO v_prva
    FROM public.assigned_program_exercises WHERE id = ANY(p_ex_ids);

    WITH novi AS (
      SELECT ape.id,
             row_number() OVER (
               ORDER BY CASE WHEN ape.id = ANY(p_ex_ids) THEN v_prva ELSE ape.position END,
                        CASE WHEN ape.id = ANY(p_ex_ids) THEN 0 ELSE 1 END,
                        ape.position
             ) AS nova_poz
      FROM public.assigned_program_exercises ape
      WHERE ape.day_id = p_day_id AND ape.deleted_at IS NULL
    )
    UPDATE public.assigned_program_exercises ape
    SET position = novi.nova_poz,
        superset_group = CASE WHEN ape.id = ANY(p_ex_ids) THEN v_grupa ELSE ape.superset_group END
    FROM novi WHERE ape.id = novi.id;
  END IF;

  RETURN jsonb_build_object('success', true, 'superset_group', v_grupa,
                            'clanova', array_length(p_ex_ids, 1));
END;
$function$;

-- Razdvajanje pusta CEO krug, ne samo jednu vezbu: krug od jednog clana nije
-- krug, a ostavljen bi na satu i dalje pisao "superset".
CREATE OR REPLACE FUNCTION public.builder_clear_superset(p_scope text, p_day_id uuid, p_ex_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_grupa smallint; v_rows int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni'; END IF;
  PERFORM public.require_active_trainer_sub();

  IF p_scope = 'template' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.program_template_days d
      JOIN public.program_templates t ON t.id = d.template_id
      WHERE d.id = p_day_id AND t.trainer_id = auth.uid()
    ) THEN RAISE EXCEPTION 'Nije tvoj sablon'; END IF;

    SELECT superset_group INTO v_grupa FROM public.program_template_exercises
    WHERE id = p_ex_id AND day_id = p_day_id;
    IF v_grupa IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u supersetu'; END IF;

    UPDATE public.program_template_exercises SET superset_group = NULL
    WHERE day_id = p_day_id AND superset_group = v_grupa;
  ELSIF p_scope = 'assigned' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.assigned_program_days d
      JOIN public.assigned_programs p ON p.id = d.assigned_program_id
      WHERE d.id = p_day_id AND p.trainer_id = auth.uid()
    ) THEN RAISE EXCEPTION 'Nije tvoj program'; END IF;

    SELECT superset_group INTO v_grupa FROM public.assigned_program_exercises
    WHERE id = p_ex_id AND day_id = p_day_id;
    IF v_grupa IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u supersetu'; END IF;

    UPDATE public.assigned_program_exercises SET superset_group = NULL
    WHERE day_id = p_day_id AND superset_group = v_grupa;
  ELSE
    RAISE EXCEPTION 'Nepoznat opseg';
  END IF;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'razdvojeno', v_rows);
END;
$function$;

REVOKE ALL ON FUNCTION public.builder_set_superset(text, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.builder_clear_superset(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.builder_set_superset(text, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.builder_clear_superset(text, uuid, uuid) TO authenticated;
