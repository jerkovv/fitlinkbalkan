-- Trener nije mogao da sacuva nijedan prekidac obavestenja: okidac nad
-- trainer_notification_prefs radi sa pravima onoga ko upisuje (authenticated),
-- a zove _trainer_notif_group_kinds koja je (ispravno) oduzeta od authenticated,
-- pa je svaki upis padao sa 42501. Okidac zato ide kao SECURITY DEFINER;
-- pomocna funkcija ostaje zatvorena. Telo je isto kao do sada.
CREATE OR REPLACE FUNCTION public.tg_trainer_notif_prefs_groups()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  g text;
  v_novo boolean;
  v_staro boolean;
  v_vrste text[];
BEGIN
  FOREACH g IN ARRAY ARRAY['bookings','payments','workouts','messages'] LOOP
    v_novo := (to_jsonb(NEW) ->> g)::boolean;
    v_staro := CASE WHEN TG_OP = 'UPDATE' THEN (to_jsonb(OLD) ->> g)::boolean END;
    v_vrste := public._trainer_notif_group_kinds(g);
    IF TG_OP = 'INSERT' THEN
      IF v_novo = false THEN
        NEW.muted_kinds := (SELECT array_agg(DISTINCT k ORDER BY k) FROM unnest(NEW.muted_kinds || v_vrste) k);
      END IF;
    ELSIF v_novo IS DISTINCT FROM v_staro THEN
      IF v_novo = false THEN
        NEW.muted_kinds := (SELECT array_agg(DISTINCT k ORDER BY k) FROM unnest(NEW.muted_kinds || v_vrste) k);
      ELSE
        NEW.muted_kinds := coalesce(
          (SELECT array_agg(k ORDER BY k) FROM unnest(NEW.muted_kinds) k WHERE k <> ALL (v_vrste)),
          '{}'
        );
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

-- Funkcija okidaca se ne zove rucno; posto je sad SECURITY DEFINER, ne ostaje otvorena.
REVOKE EXECUTE ON FUNCTION public.tg_trainer_notif_prefs_groups() FROM PUBLIC, anon, authenticated;
