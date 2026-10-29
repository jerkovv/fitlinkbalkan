-- Dan programa bez ijedne vezbe se sa sata mogao pokrenuti: _start_workout_session napravi
-- aktivnu sesiju, ali ne i zivi red (nema pozicije), pa u nju niko ne moze da udje, a svako
-- drugo pokretanje dobija "Trening već traje". Sat sada takvo pokretanje odbija: sesija
-- napravljena u ovom pozivu se ponistava (blok sa EXCEPTION vraca sve sto je u njemu
-- uradjeno) i vezbac dobija razumljivu poruku.
-- Uslov "nema nijedne upisane serije" cuva nastavak postojece sesije koja je vec odradjena.

CREATE OR REPLACE FUNCTION public.watch_start_workout(p_token text, p_assigned_program_id uuid, p_day_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
  v_session_id uuid;
begin
  select user_id into v_user_id from public.watch_pairing_tokens
   where token = p_token and revoked_at is null and expires_at > now();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'invalid_token');
  end if;

  begin
    v_session_id := public._start_workout_session(v_user_id, p_assigned_program_id, p_day_id);

    if not exists (select 1 from public.workout_live_state
                    where session_log_id = v_session_id
                      and current_state in ('active','rest'))
       and not exists (select 1 from public.set_logs where session_log_id = v_session_id) then
      raise exception 'Ovaj dan nema vežbi.';
    end if;
  exception when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
  end;

  return jsonb_build_object('success', true, 'session_id', v_session_id);
end;
$function$;
