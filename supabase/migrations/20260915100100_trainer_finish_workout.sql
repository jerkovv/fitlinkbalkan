-- Trener zaustavlja trening koji je vezbac zaboravio da ugasi.
--
-- Do sad je kraj treninga bio iskljucivo vezbacev potez. Zaboravljena sesija je
-- ostajala aktivna zauvek (nijedan cron je ne zatvara): vezbac je "trenirao uzivo"
-- satima, a trajanje u istoriji je bilo besmisleno. Korisnik je odlucio da trener
-- sme da je zaustavi.
--
-- Cuvar je isti kao za ostale trenerove radnje usred treninga
-- (_trainer_session_guard: prijavljen, aktivna pretplata, trening u toku, njegov
-- vezbac). Kraj ide ISTIM putem kao vezbacev "Zavrsi" (_engine_finish_workout):
-- sesija se zatvori, zivi red dobija current_state = 'completed', pa telefon, sat i
-- Live Activity to vide kao obican kraj. Upisane serije ostaju, nista se ne brise.

CREATE OR REPLACE FUNCTION public.trainer_finish_workout(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_athlete uuid;
BEGIN
  v_athlete := public._trainer_session_guard(p_session_id);
  RETURN public._engine_finish_workout(v_athlete, p_session_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.trainer_finish_workout(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_finish_workout(uuid) TO authenticated;
