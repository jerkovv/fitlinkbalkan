-- Zeleno (serija odradjena) je VEZBACEVO stanje. Trener ga ne pali i ne gasi.
--
-- Podela je sada cista:
--   * serija JOS NIJE odradjena -> trenerov broj je CILJ (trainer_set_set_target)
--   * serija JESTE odradjena    -> trenerov broj je ispravka stvarnog (ovde)
--
-- trainer_log_set zato vise NE PRAVI zapis, samo menja postojeci. Ranije je
-- radio INSERT ... ON CONFLICT DO UPDATE, pa je trener upisom brojeva usput
-- oznacavao seriju kao zavrsenu - a to sme samo vezbac, svojim klikom.
CREATE OR REPLACE FUNCTION public.trainer_log_set(
  p_session_id uuid,
  p_ape_id     uuid,
  p_set_number integer,
  p_reps       integer DEFAULT NULL,
  p_weight     numeric DEFAULT NULL,
  p_rpe        numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_athlete uuid; v_ape uuid; v_rows int;
BEGIN
  v_athlete := public._trainer_edit_guard(p_session_id);

  v_ape := public._session_plan_row(p_session_id, p_ape_id);
  IF v_ape IS NULL THEN RAISE EXCEPTION 'Ta vezba nije u ovom treningu'; END IF;

  -- Samo UPDATE: broj upisanih serija se ne menja, pa se ni pozicija vezbaca
  -- ne moze pomeriti ovim putem.
  UPDATE public.set_logs
  SET reps      = COALESCE(p_reps, reps),
      weight_kg = COALESCE(p_weight, weight_kg),
      rpe       = COALESCE(p_rpe, rpe),
      logged_by_trainer = true
  WHERE session_log_id = p_session_id
    AND exercise_id = v_ape
    AND set_number = p_set_number;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Tu seriju vezbac jos nije zavrsio';
  END IF;

  RETURN jsonb_build_object('success', true, 'set_number', p_set_number);
END;
$$;

-- Ponistavanje upisa se povlaci: trener ne sme da skine zeleno. Funkcija se
-- brise, a ne samo sakriva u UI-u - inace ostaje nabijen okidac koji radi bas
-- ono sto je pravilom zabranjeno.
DROP FUNCTION IF EXISTS public.trainer_unlog_set(uuid, uuid, integer);

REVOKE ALL ON FUNCTION public.trainer_log_set(uuid, uuid, integer, integer, numeric, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trainer_log_set(uuid, uuid, integer, integer, numeric, numeric) TO authenticated;
