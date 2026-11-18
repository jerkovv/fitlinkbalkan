-- Brana pretplate: rupe nadjene 2026-11-18.
-- Trener bez aktivne FitLink pretplate je i dalje mogao da:
--   1) obrise trening koji je sam upisao unazad (trainer_delete_past_workout nije imao proveru),
--   2) dodaje, menja i brise rezervacije direktno u session_bookings,
--   3) salje poruku uzivo direktnim upisom u workout_live_messages (RPC je vec bio zatvoren),
--   4) otkaci vezbaca direktnom izmenom tabele athletes (RPC je vec bio zatvoren),
--   5) pise u stare tabele payments, sessions i trainer_sessions,
--   6) pise vezbacima u chatu (messages).
-- Poziv vezbaca je zatvoren posebno, u edge funkciji send-invite (ona pise service role
-- kljucem, pa je RLS ne dotice).
--
-- can_trainer_write() vraca true za svakoga ko nije trener, a SECURITY DEFINER funkcije
-- (book_session, cancel_session_booking, trainer_add_booking...) RLS ne dotice, pa se za
-- vezbace i za server nista ne menja. Citanje nije dirano: trener i dalje sve vidi.

-- 1) Brisanje upisanog treninga.
CREATE OR REPLACE FUNCTION public.trainer_delete_past_workout(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_ath uuid; v_ko uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni'; END IF;
  PERFORM public.require_active_trainer_sub();

  SELECT athlete_id, entered_by_trainer INTO v_ath, v_ko
  FROM public.workout_session_logs WHERE id = p_session_id;

  IF v_ath IS NULL THEN RAISE EXCEPTION 'Trening ne postoji'; END IF;
  IF v_ko IS NULL THEN
    RAISE EXCEPTION 'Ovaj trening je odradio vezbac - ne brise se odavde';
  END IF;
  IF NOT public.is_my_athlete(v_uid, v_ath) THEN
    RAISE EXCEPTION 'Nije tvoj vezbac';
  END IF;

  -- set_logs i vezbe sesije odlaze kaskadno (oba imaju ON DELETE CASCADE).
  DELETE FROM public.workout_session_logs WHERE id = p_session_id;
  RETURN jsonb_build_object('success', true);
END;
$function$;

-- 2) Rezervacije, 5) stare tabele: iste tri politike kao na ostalih 28 tabela.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['session_bookings', 'payments', 'sessions', 'trainer_sessions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS pretplata_gate_ins ON public.%I', t);
    EXECUTE format('CREATE POLICY pretplata_gate_ins ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.can_trainer_write())', t);
    EXECUTE format('DROP POLICY IF EXISTS pretplata_gate_upd ON public.%I', t);
    EXECUTE format('CREATE POLICY pretplata_gate_upd ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.can_trainer_write()) WITH CHECK (public.can_trainer_write())', t);
    EXECUTE format('DROP POLICY IF EXISTS pretplata_gate_del ON public.%I', t);
    EXECUTE format('CREATE POLICY pretplata_gate_del ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.can_trainer_write())', t);
  END LOOP;
END $$;

-- 3) Poruka uzivo: trener je jedini ko upisuje (vezbac samo oznacava procitano).
DROP POLICY IF EXISTS pretplata_gate_ins ON public.workout_live_messages;
CREATE POLICY pretplata_gate_ins ON public.workout_live_messages
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_trainer_write());

-- 4) Tabela athletes: svoj red svako menja kao i do sada (i trener koji je nekome vezbac),
--    admin panel takodje; tudji red samo trener sa aktivnom pretplatom.
DROP POLICY IF EXISTS pretplata_gate_upd ON public.athletes;
CREATE POLICY pretplata_gate_upd ON public.athletes
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin() OR public.can_trainer_write())
  WITH CHECK (id = auth.uid() OR public.is_admin() OR public.can_trainer_write());

-- 6) Chat: trener bez pretplate cita poruke i oznacava ih kao procitane, ali ne pise nove.
--    Vezbac pise kao i do sada (can_trainer_write() ga propusta).
DROP POLICY IF EXISTS pretplata_gate_ins ON public.messages;
CREATE POLICY pretplata_gate_ins ON public.messages
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_trainer_write());
