-- Pauza se moze menjati USRED treninga, i u planiranom i u slobodnom.
--
-- Do sada je pauza bila zakljucana u planu: trener je moze podesiti dok pravi
-- program, ali ne i kad u sali vidi da coveku treba vise (ili manje) vremena.
--
-- Pise se na OBA mesta - i na vezbu i na sve njene per-set redove. Motor cita
-- per-set vrednost sa fallbackom na vezbu, pa bi izmena samo na vezbi izgledala
-- kao da nista nije uradjeno cim vezba ima per-set redove (a ima ih skoro svaka).
--
-- Vazi od SLEDECE pauze: ona koja tece je vec usidrena u rest_ends_at, i menjati
-- je pod nogama coveku koji gleda odbrojavanje bilo bi gore nego cekati.
--
-- Slobodan trening je pokriven istim putem: njegove vezbe su od pocetka vezane
-- za sesiju, pa _fork_session_plan odmah izadje, a _session_plan_row nadje red
-- po sopstvenom id-u.
CREATE OR REPLACE FUNCTION public.trainer_set_rest(
  p_session_id uuid, p_ape_id uuid, p_seconds integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_athlete uuid; v_ape uuid;
BEGIN
  v_athlete := public._trainer_edit_guard(p_session_id);

  IF p_seconds IS NULL OR p_seconds < 0 OR p_seconds > 600 THEN
    RAISE EXCEPTION 'Pauza mora biti izmedju 0 i 600 sekundi';
  END IF;

  -- Izmena pauze je izmena PLANA, pa vazi samo za danas.
  PERFORM public._fork_session_plan(p_session_id);
  v_ape := public._session_plan_row(p_session_id, p_ape_id);
  IF v_ape IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u ovom treningu'; END IF;

  UPDATE public.assigned_program_exercises
  SET rest_seconds = p_seconds
  WHERE id = v_ape;

  UPDATE public.assigned_program_exercise_sets
  SET rest_seconds = p_seconds
  WHERE assigned_exercise_id = v_ape;

  -- Podigni plan_version: to je jedini signal vezbacevom telefonu i satu.
  RETURN public._trainer_resync_live(p_session_id, v_athlete)
         || jsonb_build_object('rest_seconds', p_seconds);
END;
$function$;

REVOKE ALL ON FUNCTION public.trainer_set_rest(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_set_rest(uuid, uuid, integer) TO authenticated;
