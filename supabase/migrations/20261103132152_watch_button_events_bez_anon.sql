-- watch_button_events: anon vise ne cita tudje dogadjaje sa sata.
--
-- Politika wbe_anon_realtime je davala anon ulozi (javni anon kljuc)
-- SELECT USING (true), pa je svako mogao da procita dugmad sa sata svih
-- vezbaca. Nijedan klijent tabelu ne cita (web, nativna iOS/Android, sat,
-- admin), niko nije pretplacen na nju kroz Realtime: satovi samo zovu
-- watch_press_* RPC sa tokenom sata. Te funkcije su SECURITY DEFINER u
-- vlasnistvu postgres, pa zaobilaze RLS i rade kao i do sada.
--
-- Ostaje: authenticated vidi i brise samo svoje redove (athlete_id = auth.uid()).
-- Upis ide iskljucivo kroz watch_press_* RPC.
--
-- cleanup_old_watch_events() brise dogadjaje svih vezbaca, a mogao je da ga
-- pozove i anon. Ne zove ga nijedan klijent ni cron, pa ostaje samo vlasniku
-- i service_role.
--
-- Primenjeno u produkciji kroz MCP 2026-11-03 (verzija 20261103132152).

DROP POLICY IF EXISTS wbe_anon_realtime ON public.watch_button_events;

REVOKE ALL ON TABLE public.watch_button_events FROM anon;
REVOKE ALL ON TABLE public.watch_button_events FROM authenticated;
GRANT SELECT, DELETE ON TABLE public.watch_button_events TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_watch_events() FROM PUBLIC, anon, authenticated;
