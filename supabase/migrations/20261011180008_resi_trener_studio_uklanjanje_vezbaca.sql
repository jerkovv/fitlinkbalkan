-- "Ukloni vezbaca" je samo prekidao vezu: buduci termini i aktivna clanarina su ostajali.
CREATE OR REPLACE FUNCTION public.trainer_unassign_athlete(p_athlete_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trainer uuid := auth.uid();
  v_current_trainer uuid;
  v_termina int := 0;
  v_clanarina int := 0;
BEGIN
  PERFORM public.require_active_trainer_sub();
  IF v_trainer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT trainer_id INTO v_current_trainer
  FROM public.athletes
  WHERE id = p_athlete_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_current_trainer IS DISTINCT FROM v_trainer THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_your_athlete');
  END IF;

  -- Buduci termini kod ovog trenera se otkazuju: posle uklanjanja trener vise ne moze da
  -- procita profil, pa bi termin ostao u rasporedu kao bezimeni "Vezbac" i drzao mesto.
  -- Okidaci nad session_bookings javljaju vezbacu i pomeraju listu cekanja.
  UPDATE public.session_bookings
  SET status = 'cancelled', cancelled_at = now()
  WHERE athlete_id = p_athlete_id AND trainer_id = v_trainer AND status = 'booked'
    AND public._pocetak_termina(date, start_time) > now();
  GET DIAGNOSTICS v_termina = ROW_COUNT;

  UPDATE public.session_waitlist
  SET status = 'cancelled'
  WHERE athlete_id = p_athlete_id AND trainer_id = v_trainer AND status = 'waiting';

  -- Clanarina se ovde ne dira: placena je, pa o njoj odlucuje trener posebno.

  UPDATE public.athletes
  SET trainer_id = NULL
  WHERE id = p_athlete_id;

  RETURN jsonb_build_object('success', true, 'otkazano_termina', v_termina,
                            'zatvoreno_clanarina', 0);
END;
$function$
;
