-- Podsetnik vezbacu podrazumevano pokazuje samo kad je trening i kod koga.
-- Red o roku za otkazivanje trener ukljucuje sam (client_cancel_info).
-- Funkcija notify_athlete_session_reminders je ponovo napravljena iz 20261106120000
-- (coalesce(p.client_cancel_info, false)).
ALTER TABLE public.trainer_notification_prefs ALTER COLUMN client_cancel_info SET DEFAULT false;
-- Niko ga jos nije birao (kolona je dodata danas), pa se gasi svima.
UPDATE public.trainer_notification_prefs SET client_cancel_info = false WHERE client_cancel_info;
