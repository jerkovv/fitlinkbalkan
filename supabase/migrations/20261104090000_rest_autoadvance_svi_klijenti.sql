-- Istek odmora prebacuje red na rad za SVE klijente, ne samo za iOS sa Live Activity znakom.
-- Nativna Android aplikacija drzi odmor u foreground servisu, ali kad je proces ubijen niko ne
-- zove athlete_skip_rest, pa je red ostajao u 'rest' i trener je video odmor koji je odavno
-- prosao. _engine_skip_rest je idempotentan (stanje racuna iz pozicije), pa trka sa klijentom
-- koji sam preskoci odmor ne pravi stetu; isto ponasanje vec vazi za iOS redove.
CREATE OR REPLACE FUNCTION public.advance_expired_rests()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.workout_live_state ls
  set current_state = 'active',
      rest_ends_at = null,
      last_heartbeat = now()
  where ls.current_state = 'rest'
    and ls.rest_ends_at <= now()
    and ls.rest_ends_at > now() - interval '3 minutes'
    and exists (
      select 1 from public.workout_session_logs s
      where s.id = ls.session_log_id
        and s.is_active = true
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.advance_expired_rests() FROM PUBLIC, anon, authenticated;
