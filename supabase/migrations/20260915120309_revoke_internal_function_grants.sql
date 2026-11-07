-- Interne funkcije vise nisu dostupne klijentu.
--
-- Pomocne SECURITY DEFINER funkcije sa donjom crtom (_engine_*, _finalize_*,
-- _start_*, _trainer_*_guard, ...) primaju user id ili session id kao parametar
-- i veruju mu. Bile su EXECUTE za PUBLIC, anon i authenticated, pa je svako mogao
-- da ih pozove direktno kroz PostgREST (/rest/v1/rpc/_engine_finish_workout) i
-- tudjem vezbacu zavrsi trening, potvrdi seriju ili preskoci pauzu.
--
-- Pozivaju ih iskljucivo omotaci (athlete_*, watch_*, trainer_*, start_*) koji
-- su i sami SECURITY DEFINER sa vlasnikom postgres, pa unutrasnji poziv ide kao
-- postgres i ne zavisi od grantova klijenta. Okidaci (_tg_*, _enforce_*) se na
-- EXECUTE proveravaju samo pri CREATE TRIGGER, ne kad se okinu. Nijedna RLS
-- politika, view, default kolone ni cron posao ih ne koriste, a ni web, sat,
-- admin ni edge funkcije ih ne zovu direktno (provereno 2026-09-15).
--
-- Iz istog razloga zatvaramo i dve interne funkcije bez donje crte koje veruju
-- prosledjenom id-u trenera:
--   trainer_live_content(uuid)  - imena i puls vezbaca koji upravo treniraju;
--                                 anon je mogao da ih cita za bilo kog trenera.
--                                 Zovu je samo Live Activity okidaci i trainer_la_*.
--   should_notify_trainer(uuid, text) - zovu je samo notify_* okidaci.
--
-- service_role i postgres zadrzavaju EXECUTE.
--
-- Napomena za ubuduce: ALTER DEFAULT PRIVILEGES za postgres u semi public daje
-- EXECUTE anon, authenticated i service_role svakoj NOVOJ funkciji, a Postgres
-- uz to svakoj novoj funkciji daje EXECUTE i PUBLIC. CREATE OR REPLACE zadrzava
-- postojece grantove, ali nova interna funkcija (ili DROP + CREATE postojece)
-- opet je otvorena klijentu. Zato svaka interna funkcija mora da nosi svoj
-- REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated.

-- Motor treninga
REVOKE EXECUTE ON FUNCTION public._engine_complete_set(uuid, uuid, integer, numeric, numeric, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._engine_finish_workout(uuid, uuid, integer, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._engine_skip_rest(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._engine_extend_rest(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._finalize_workout_session(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._start_workout_session(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._start_free_workout_session(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._compute_hr_zones(jsonb, integer) FROM PUBLIC, anon, authenticated;

-- Trenerove izmene uzivo
REVOKE EXECUTE ON FUNCTION public._trainer_session_guard(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._trainer_edit_guard(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._trainer_offline_guard(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._trainer_resync_live(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._session_ape(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._session_plan_row(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._fork_session_plan(uuid) FROM PUBLIC, anon, authenticated;

-- Okidaci i lista cekanja
REVOKE EXECUTE ON FUNCTION public._enforce_single_active_program() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._tg_promote_waitlist_on_cancel() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._tg_promote_waitlist_on_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._promote_waitlist(uuid, date, time without time zone, uuid) FROM PUBLIC, anon, authenticated;

-- Interne bez donje crte
REVOKE EXECUTE ON FUNCTION public.trainer_live_content(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.should_notify_trainer(uuid, text) FROM PUBLIC, anon, authenticated;

-- Provera: nijedna interna funkcija ne sme ostati dostupna klijentu. Hvata i
-- funkciju sa donjom crtom koja je u medjuvremenu dodata a nije na spisku.
DO $$
DECLARE
  v_open text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.proname)
    INTO v_open
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND (p.proname LIKE '\_%' OR p.proname IN ('trainer_live_content', 'should_notify_trainer'))
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'Interne funkcije i dalje dostupne klijentu: %', v_open;
  END IF;
END $$;
