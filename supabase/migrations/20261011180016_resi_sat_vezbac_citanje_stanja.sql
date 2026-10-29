-- watch_poll_state, tri izmene:
-- 1) Rok naloga klizi (vidi 01): citanje stanja je poziv kroz koji sat prolazi stalno.
-- 2) is_duration_based i current_duration_minutes su trazeni samo po danu programa
--    (ape.day_id = s.day_id). Sesija koja ima SVOJ spisak vezbi (slobodan trening kome je
--    trener dodao vezbe, ili dan koji je trener izmenio uzivo) tu nije nalazila nista ili je
--    nalazila pogresnu vezbu, pa je sat kardio prikazivao i upisivao kao seriju sa tezinom.
--    Sada se tekuca vezba trazi istim pravilom kao u watch_compute_position: spisak sesije
--    ako postoji, inace dan programa.
-- 3) Novo polje last_weight: tezina poslednje upisane serije tekuce vezbe u ovoj sesiji, sa
--    bilo kog uredjaja. Sat od nje polazi kad plan nema kilazu, pa pokazuje isto sto i
--    telefon (koji je cita iz istih upisa). Stari klijenti polje ne citaju.

CREATE OR REPLACE FUNCTION public.watch_poll_state(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid; v_state jsonb; v_max_hr integer;
BEGIN
  SELECT user_id INTO v_user_id FROM public.watch_pairing_tokens
   WHERE token = p_token AND revoked_at IS NULL AND expires_at > now();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'invalid_token'); END IF;

  -- Nalog koji se koristi ne istice: rok je 30 dana od poslednje upotrebe.
  UPDATE public.watch_pairing_tokens
  SET last_used_at = now(),
      expires_at = GREATEST(expires_at, now() + interval '30 days')
  WHERE token = p_token;

  v_max_hr := public.athlete_effective_max_hr(v_user_id);

  SELECT jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'server_now_ms', (extract(epoch FROM now())*1000)::bigint,
    'workout', jsonb_build_object(
      'session_id', wls.session_log_id,
      'current_exercise_name', wls.current_exercise_name,
      'current_exercise_idx', wls.current_exercise_idx,
      'current_set_number', wls.current_set_number,
      'total_sets', wls.total_sets,
      'current_state', wls.current_state,
      'current_hr', wls.current_hr,
      -- Raste kad trener izmeni vezbe ili serije usred treninga; sat tada ucitava plan ponovo.
      'plan_version', wls.plan_version,
      -- Brojke koje je vezbac ukucao za tekucu seriju na satu ili telefonu, pre zavrsetka.
      'draft', public._set_draft_json(wls.session_log_id),
      'hr_source', wls.hr_source,
      'sensor_live', COALESCE(wls.hr_source = 'sensor'
                              AND wls.hr_last_at > now() - interval '20 seconds', false),
      'is_duration_based', tek.is_duration_based,
      'current_duration_minutes', tek.duration_minutes,
      -- Tezina poslednje upisane serije tekuce vezbe (NULL dok nijedna nije upisana).
      'last_weight', (
        SELECT sl.weight_kg
        FROM public.set_logs sl
        WHERE sl.session_log_id = wls.session_log_id
          AND sl.exercise_id = tek.ape_id
          AND sl.done = true
        ORDER BY sl.set_number DESC LIMIT 1
      ),
      'last_heartbeat', wls.last_heartbeat,
      'started_at_ms', (extract(epoch FROM s.started_at)*1000)::bigint,
      'rest_ends_at_ms', (extract(epoch FROM wls.rest_ends_at)*1000)::bigint,
      'hr_max', v_max_hr,
      'hr_zone', public.hr_zone(wls.current_hr, v_max_hr),
      'hr_zone_name', public.hr_zone_name(public.hr_zone(wls.current_hr, v_max_hr)),
      'trainer_message', (
        SELECT jsonb_build_object(
          'id', m.id, 'message', m.message, 'message_type', m.message_type,
          'created_at_ms', (extract(epoch FROM m.created_at)*1000)::bigint
        )
        FROM public.workout_live_messages m
        WHERE m.session_log_id = wls.session_log_id
          AND m.created_at > now() - interval '2 minutes'
        ORDER BY m.created_at DESC LIMIT 1
      )
    )
  ) INTO v_state
  FROM public.workout_live_state wls
  JOIN public.workout_session_logs s ON s.id = wls.session_log_id
  -- Tekuca vezba: spisak sesije ako ga sesija ima, inace dan programa (isto pravilo i isti
  -- redosled kao watch_compute_position, iz koje current_exercise_idx i dolazi).
  LEFT JOIN LATERAL (
    SELECT ape2.id AS ape_id,
           ape2.duration_minutes,
           COALESCE(e2.is_duration_based, false) AS is_duration_based
    FROM public.assigned_program_exercises ape2
    JOIN public.exercises e2 ON e2.id = ape2.exercise_id
    WHERE ape2.deleted_at IS NULL
      AND wls.current_exercise_idx IS NOT NULL
      AND (CASE WHEN EXISTS (SELECT 1 FROM public.assigned_program_exercises z
                             WHERE z.session_log_id = wls.session_log_id)
                THEN ape2.session_log_id = wls.session_log_id
                ELSE ape2.day_id = s.day_id END)
    ORDER BY ape2.position OFFSET wls.current_exercise_idx LIMIT 1
  ) tek ON true
  WHERE wls.athlete_id = v_user_id
    AND wls.current_state IN ('active','rest')
    AND wls.last_heartbeat > now() - interval '5 minutes'
  ORDER BY wls.last_heartbeat DESC LIMIT 1;

  IF v_state IS NULL THEN
    v_state := jsonb_build_object('success', true, 'user_id', v_user_id,
      'server_now_ms', (extract(epoch FROM now())*1000)::bigint, 'workout', NULL);
  END IF;
  RETURN v_state;
END $function$;
