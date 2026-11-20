-- "Pošalji svima": obavestenje trenera stize vezbacima i na mejl (2026-11-20).
-- broadcast_to_athletes posle upisa obavestenja jednim pg_net pozivom zove send-app-email
-- (event trener_obavestenje) sa spiskom vezbaca; funkcija salje mejlove u grupama do 100.
-- Greska u slanju mejla nikad ne obara slanje obavestenja.

create or replace function public.broadcast_to_athletes(p_body text, p_only_active boolean default false, p_title text default null::text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_trainer_id   uuid := auth.uid();
  v_trainer_name text;
  v_today        date := (now() AT TIME ZONE 'Europe/Belgrade')::date;
  v_title        text;
  v_count        int  := 0;
  v_ids          uuid[];
  v_key          text;
BEGIN
  PERFORM public.require_active_trainer_sub();
  IF v_trainer_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Empty message';
  END IF;
  IF length(p_body) > 1000 THEN
    RAISE EXCEPTION 'Message too long (max 1000)';
  END IF;

  SELECT COALESCE(full_name, 'Trener') INTO v_trainer_name
  FROM public.profiles WHERE id = v_trainer_id;

  v_title := COALESCE(NULLIF(trim(p_title), ''),
                      'Obaveštenje od ' || v_trainer_name);

  WITH targets AS (
    SELECT a.id AS athlete_id
    FROM public.athletes a
    WHERE a.trainer_id = v_trainer_id
      AND (
        NOT p_only_active
        OR EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.athlete_id = a.id
            AND m.status = 'active'
            AND (m.ends_on IS NULL OR m.ends_on >= v_today)
        )
      )
  ),
  ins AS (
    INSERT INTO public.notifications
      (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
    SELECT
      t.athlete_id, 'athlete', v_trainer_id, t.athlete_id,
      'broadcast', v_title, trim(p_body),
      jsonb_build_object('only_active', p_only_active)
    FROM targets t
    RETURNING athlete_id
  )
  SELECT count(*), array_agg(athlete_id) INTO v_count, v_ids FROM ins;

  -- Isto obavestenje i na mejl. Naslov ide samo ako ga je trener upisao; inace mejl
  -- sam kaze ko salje.
  IF v_count > 0 THEN
    BEGIN
      SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
      IF v_key IS NOT NULL THEN
        PERFORM net.http_post(
          url := 'https://iyvvskywmqtudafapxdk.supabase.co/functions/v1/send-app-email',
          body := jsonb_build_object(
            'event', 'trener_obavestenje',
            'trainer_id', v_trainer_id,
            'athlete_ids', to_jsonb(v_ids),
            'title', NULLIF(trim(p_title), ''),
            'body', trim(p_body)
          ),
          params := '{}'::jsonb,
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
          timeout_milliseconds := 60000
        );
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  RETURN v_count;
END;
$function$;

-- Dnevnik mejlova u adminu: citljiv naziv.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.admin_email_log(integer)'::regprocedure) into v_def;
  if position('trener_obavestenje' in v_def) = 0 then
    v_def := replace(v_def,
      $a$when 'admin_novi_trener' then 'Admin: novi trener'$a$,
      $a$when 'admin_novi_trener' then 'Admin: novi trener'
                 when 'trener_obavestenje' then 'Obaveštenje od trenera'$a$);
    execute v_def;
  end if;
end $$;
