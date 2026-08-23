-- Trener upisuje ceo trening za vezbaca koji nije poneo telefon.
--
-- RAZDVAJANJE OD ZIVOG TRENINGA NIJE DOGOVOR NEGO POSLEDICA SEME.
-- Pravilo "zeleno pali iskljucivo vezbac" (vidi 20260820230000) vazi za ZIVU
-- sesiju: is_active = true, postoji red u workout_live_state, poziciju vodi
-- watch_compute_position. Trening koji trener upisuje naknadno je ZAVRSEN OD
-- RODJENJA: is_active = false, completed_at popunjen, i - kljucno - red u
-- workout_live_state se NE PRAVI UOPSTE. Iz toga sledi samo od sebe:
--   * _trainer_session_guard trazi is_active = true, pa nijedan zivi trenerov
--     RPC ne moze ni da dohvati ovakvu sesiju;
--   * bez zivog reda nema plan_version, pa ni telefon ni sat nikad ne saznaju
--     za nju - nema koga da pomeri;
--   * a u drugom smeru, _trainer_offline_guard odbija upis dok vezbac trenira.
-- Dve staze se ne mogu ukrstiti ni u jednom smeru.
ALTER TABLE public.workout_session_logs
  ADD COLUMN IF NOT EXISTS entered_by_trainer uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entry_title text;

COMMENT ON COLUMN public.workout_session_logs.entered_by_trainer IS
  'NULL = vezbac je sam odradio i zabelezio. Popunjeno = trener upisao naknadno.';

CREATE INDEX IF NOT EXISTS wsl_entered_by_trainer_idx
  ON public.workout_session_logs (entered_by_trainer)
  WHERE entered_by_trainer IS NOT NULL;

-- Cuvar za offline upis. Namerno drugaciji od _trainer_session_guard: taj trazi
-- ZIVU sesiju, ovaj trazi da vezbac BAS SAD ne trenira.
CREATE OR REPLACE FUNCTION public._trainer_offline_guard(p_athlete_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni'; END IF;
  PERFORM public.require_active_trainer_sub();
  IF NOT public.is_my_athlete(v_uid, p_athlete_id) THEN
    RAISE EXCEPTION 'Nije tvoj vezbac';
  END IF;

  IF EXISTS (SELECT 1 FROM public.workout_session_logs s
             WHERE s.athlete_id = p_athlete_id AND s.is_active = true) THEN
    RAISE EXCEPTION 'Vezbac trenutno trenira - upisi trening kad zavrsi';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workout_live_state w
             WHERE w.athlete_id = p_athlete_id AND w.current_state IN ('active','rest')
               AND w.last_heartbeat > now() - interval '5 minutes') THEN
    RAISE EXCEPTION 'Vezbac trenutno trenira - upisi trening kad zavrsi';
  END IF;

  RETURN p_athlete_id;
END;
$$;

-- Licni rekordi se NE racunaju iz treninga koji je upisao trener.
--
-- Bez ovoga trener dobija obavestenje "vezbac oborio rekord" na brojevima koje
-- je sam ukucao, a jedna omaska (120 umesto 12) trajno truje istoriju rekorda.
DO $$
DECLARE v_src text; v_new text;
BEGIN
  SELECT p.prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_personal_record';

  v_new := replace(v_src,
'  IF NEW.done IS NOT TRUE THEN RETURN NEW; END IF;',
'  IF NEW.done IS NOT TRUE THEN RETURN NEW; END IF;
  -- Trening koji je trener upisao naknadno ne pravi licne rekorde: brojeve nije
  -- izmerio uredjaj nego ih je neko ukucao, pa jedna omaska ostaje zauvek.
  IF EXISTS (SELECT 1 FROM public.workout_session_logs s
             WHERE s.id = NEW.session_log_id AND s.entered_by_trainer IS NOT NULL)
  THEN RETURN NEW; END IF;');

  IF v_new = v_src THEN
    RAISE EXCEPTION 'update_personal_record: obrazac nije nadjen, funkcija nije menjana';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.update_personal_record()
     RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %L',
    v_new);
END $$;

REVOKE ALL ON FUNCTION public._trainer_offline_guard(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._trainer_offline_guard(uuid) TO authenticated;
