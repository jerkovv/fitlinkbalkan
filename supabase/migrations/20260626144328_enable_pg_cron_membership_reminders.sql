create extension if not exists pg_cron;

select cron.schedule(
  'membership-expiry-reminders',
  '0 8 * * *',
  $$select public.fn_send_expiry_reminders();$$
);
