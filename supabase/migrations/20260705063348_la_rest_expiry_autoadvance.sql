-- BUG4: Live Activity rest countdown ostaje zamrznut na 0:00 kad je app u pozadini.
-- Push infra (trg_live_state_push -> send-la-push -> APNs) vec postoji i radi; fali samo
-- serverski posao koji istekli rest prebaci u active. Ekvivalent onome sto foreground app
-- vec radi na 0 (RestTimer onDone -> skipRest), samo radi i dok je telefon zakljucan.
-- Pozicija sledece serije je VEC u redu (postavlja je _engine_complete_set) - samo se skida
-- rest flag, nikad se ne loguje serija.

create or replace function public.advance_expired_rests()
returns void
language sql
security definer
set search_path = public
as $$
  update public.workout_live_state ls
  set current_state = 'active',
      rest_ends_at = null,
      last_heartbeat = now()
  where ls.current_state = 'rest'
    and ls.rest_ends_at <= now()
    and ls.rest_ends_at > now() - interval '3 minutes'
    and ls.la_push_token is not null
    and exists (
      select 1 from public.workout_session_logs s
      where s.id = ls.session_log_id
        and s.is_active = true
    );
$$;

revoke all on function public.advance_expired_rests() from public;

-- na 15s: najgori slucaj kasnjenja izlaska iz pauze na lock screen-u je ~15s
do $$
begin
  if exists (select 1 from cron.job where jobname = 'la-rest-expiry-autoadvance') then
    perform cron.unschedule('la-rest-expiry-autoadvance');
  end if;
  perform cron.schedule(
    'la-rest-expiry-autoadvance',
    '15 seconds',
    'select public.advance_expired_rests();'
  );
end $$;
