-- Vezbac ume da zaboravi da ugasi trening, pa mu trening "traje" satima i kvari
-- istoriju. Kao kod Apple Fitness-a: kad nema nikakve aktivnosti, stigne podsetnik.
--
-- Tisina se meri po workout_live_state.last_heartbeat - njega osvezavaju i telefon i
-- sat na svakih par sekundi, pa je to najposteniji znak da trening jos radi.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (
  kind = ANY (ARRAY[
    'booking_created','booking_canceled','booking_canceled_by_trainer','workout_completed',
    'message','program_assigned','nutrition_assigned','message_from_trainer',
    'membership_expiring','membership_expired','membership_activated','membership_rejected',
    'payment_request','payment_marked','broadcast','generic','pr_set',
    'waitlist_promoted','waitlist_joined','workout_forgotten'
  ])
);

CREATE OR REPLACE FUNCTION public.notify_forgotten_workouts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_tisina interval;
  v_faza int;
  v_trajanje text;
  v_tisina_min int;
  v_broj int := 0;
BEGIN
  FOR r IN
    SELECT s.id, s.athlete_id, s.started_at,
           COALESCE(ls.last_heartbeat, s.started_at) AS zadnja
    FROM public.workout_session_logs s
    LEFT JOIN public.workout_live_state ls ON ls.session_log_id = s.id
    WHERE s.is_active = true
  LOOP
    v_tisina := now() - r.zadnja;
    -- Prvo posle 20 min tisine, pa jos jednom posle sat vremena; dalje ne dosadjujemo.
    v_faza := CASE
      WHEN v_tisina >= interval '60 minutes' THEN 2
      WHEN v_tisina >= interval '20 minutes' THEN 1
      ELSE 0
    END;
    CONTINUE WHEN v_faza = 0;

    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.kind = 'workout_forgotten'
        AND n.meta->>'session_log_id' = r.id::text
        AND COALESCE((n.meta->>'faza')::int, 1) >= v_faza
    );

    v_tisina_min := (extract(epoch FROM v_tisina) / 60)::int;
    v_trajanje := CASE
      WHEN extract(epoch FROM (now() - r.started_at)) >= 3600
        THEN floor(extract(epoch FROM (now() - r.started_at)) / 3600)::int || 'h '
             || (floor(extract(epoch FROM (now() - r.started_at)) / 60)::int % 60) || 'min'
      ELSE floor(extract(epoch FROM (now() - r.started_at)) / 60)::int || 'min'
    END;

    INSERT INTO public.notifications
      (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
    VALUES (
      r.athlete_id, 'athlete', NULL, r.athlete_id, 'workout_forgotten',
      'Još treniraš?',
      'Trening traje ' || v_trajanje || ', a nema aktivnosti ' || v_tisina_min ||
        ' min. Ako si završio, uđi i ugasi ga da bi se sačuvao.',
      jsonb_build_object('session_log_id', r.id, 'faza', v_faza)
    );
    v_broj := v_broj + 1;
  END LOOP;

  RETURN v_broj;
END $function$;

REVOKE EXECUTE ON FUNCTION public.notify_forgotten_workouts() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('workout-forgotten-reminder')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'workout-forgotten-reminder');

SELECT cron.schedule('workout-forgotten-reminder', '*/5 * * * *', 'select public.notify_forgotten_workouts();');
