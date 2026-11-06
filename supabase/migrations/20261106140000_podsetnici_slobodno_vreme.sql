-- Trener moze da izabere bilo koje vreme pred termin (5 min do 24 h), za sebe i za klijente,
-- pored brzih izbora u aplikaciji. I dalje najvise 3 podsetnika.
-- Prozor u notify_session_reminders je prosiren na 1441 min (20261106120000).

ALTER TABLE public.trainer_notification_prefs DROP CONSTRAINT IF EXISTS trainer_notif_prefs_podsetnici;
ALTER TABLE public.trainer_notification_prefs ADD CONSTRAINT trainer_notif_prefs_podsetnici CHECK (
  reminder_grouping IN ('by_time', 'per_session')
  AND cardinality(reminder_leads) <= 3
  AND 5 <= ALL (reminder_leads) AND 1440 >= ALL (reminder_leads)
);

ALTER TABLE public.trainer_notification_prefs DROP CONSTRAINT IF EXISTS trainer_notif_prefs_klijenti;
ALTER TABLE public.trainer_notification_prefs ADD CONSTRAINT trainer_notif_prefs_klijenti CHECK (
  5 <= ALL (client_reminder_leads) AND 1440 >= ALL (client_reminder_leads)
  AND cardinality(client_reminder_leads)
      + (client_evening_at IS NOT NULL)::int + (client_morning_at IS NOT NULL)::int <= 3
  AND (client_message IS NULL OR char_length(client_message) <= 140)
);
