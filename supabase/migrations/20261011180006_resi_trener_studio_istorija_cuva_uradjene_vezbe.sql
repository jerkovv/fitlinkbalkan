-- Izmena programa vezbaca je prepravljala detalje vec odradjenih treninga: uklonjena
-- vezba je nestajala zajedno sa upisanim serijama, a kasnije dodata se pojavljivala kao
-- neuradjena. Da se zna sta je dodato posle treninga, vezba u programu dobija created_at.
-- Postojeci redovi ostaju NULL (nepoznato), samo novi dobijaju vreme upisa.
ALTER TABLE public.assigned_program_exercises ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.assigned_program_exercises ALTER COLUMN created_at SET DEFAULT now();

CREATE OR REPLACE FUNCTION public.get_inapp_workout_detail(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_athlete uuid;
  v_day_id uuid;
  v_completed timestamptz;
  v_result jsonb;
  v_exercises jsonb;
  v_cfg_max int;
  v_birth_year int;
  v_max_hr int;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT athlete_id, day_id, completed_at INTO v_athlete, v_day_id, v_completed
  FROM public.workout_session_logs WHERE id = p_session_id;
  IF v_athlete IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_caller <> v_athlete AND NOT EXISTS (
    SELECT 1 FROM public.athletes a WHERE a.id = v_athlete AND a.trainer_id = v_caller
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  -- Max puls za zone: rucno podeseno ako postoji, inace 220 minus godine, inace fallback 190
  SELECT max_hr INTO v_cfg_max FROM public.user_hr_config WHERE user_id = v_athlete AND max_hr > 0;
  SELECT birth_year INTO v_birth_year FROM public.athletes WHERE id = v_athlete;
  v_max_hr := COALESCE(
    v_cfg_max,
    CASE WHEN v_birth_year IS NOT NULL AND v_birth_year > 1900
         THEN 220 - (EXTRACT(YEAR FROM now())::int - v_birth_year)
         ELSE 190 END
  );
  IF v_max_hr IS NULL OR v_max_hr < 100 THEN v_max_hr := 190; END IF;

  -- Spisak vezbi sa planom (sazetak + per-set ciljevi) i uradjenim serijama
  SELECT jsonb_agg(ex_row ORDER BY ex_pos) INTO v_exercises
  FROM (
    SELECT ape.position AS ex_pos,
      jsonb_build_object(
        'exercise_name', COALESCE(e.name, 'Vezba'),
        'superset_group', ape.superset_group,
        'planned_sets', ape.sets,
        'planned_reps', ape.reps,
        'planned_weight_kg', ape.weight_kg,
        'planned_duration_minutes', ape.duration_minutes,
        'is_duration_based', COALESCE(e.is_duration_based, false),
        'planned_set_details', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'set_number', aps.set_number,
            'reps', aps.reps,
            'weight_kg', aps.weight_kg,
            'rest_seconds', aps.rest_seconds,
            'set_type', aps.set_type
          ) ORDER BY aps.set_number)
          FROM public.assigned_program_exercise_sets aps
          WHERE aps.assigned_exercise_id = ape.id
        ), '[]'::jsonb),
        'sets', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'set_number', sl.set_number,
            'reps', sl.reps,
            'weight_kg', sl.weight_kg,
            'rpe', sl.rpe,
            'duration_minutes', sl.duration_minutes,
            'done', sl.done
          ) ORDER BY sl.set_number)
          FROM public.set_logs sl
          WHERE sl.session_log_id = p_session_id AND sl.exercise_id = ape.id
        ), '[]'::jsonb),
        'done_count', (
          SELECT count(*) FROM public.set_logs sl
          WHERE sl.session_log_id = p_session_id AND sl.exercise_id = ape.id AND sl.done = true
        )
      ) AS ex_row
    FROM public.assigned_program_exercises ape
    LEFT JOIN public.exercises e ON e.id = ape.exercise_id
    -- Trening bez svoje kopije plana cita vezbe dana. Trener taj dan menja i kasnije, pa:
    -- vezba sa upisanim serijama ostaje u istoriji i kad je posle uklonjena iz programa,
    -- vezba uklonjena tek posle treninga ostaje kao neuradjena, a vezba dodata posle
    -- zavrsetka se ne prikazuje (created_at NULL = red stariji od ove kolone, vazi kao ranije).
    WHERE (CASE WHEN EXISTS (SELECT 1 FROM public.assigned_program_exercises z
                              WHERE z.session_log_id = p_session_id)
                 THEN ape.session_log_id = p_session_id AND ape.deleted_at IS NULL
                 ELSE ape.day_id = v_day_id AND (
                   EXISTS (SELECT 1 FROM public.set_logs sl
                           WHERE sl.session_log_id = p_session_id AND sl.exercise_id = ape.id)
                   OR ((ape.deleted_at IS NULL
                        OR (v_completed IS NOT NULL AND ape.deleted_at > v_completed))
                       AND (v_completed IS NULL OR ape.created_at IS NULL
                            OR ape.created_at <= v_completed))
                 ) END)
  ) sub;

  SELECT jsonb_build_object(
    'success', true,
    'id', s.id,
    'day_number', s.day_number,
    'started_at', s.started_at,
    'completed_at', s.completed_at,
    'duration_seconds', s.duration_seconds,
    'total_volume_kg', s.total_volume_kg,
    'active_calories', s.active_calories,
    'hr_avg', s.live_hr_avg,
    'hr_max', NULLIF(s.live_hr_max, 0),
    -- Uvek [[sekunde, bpm], ...], bez obzira kojim oblikom je puls upisan.
    'hr_series', hr.ser,
    'max_hr', v_max_hr,
    'zones', public._compute_hr_zones(hr.ser, v_max_hr),
    'notes', s.notes,
    'program_name', ap.name,
    'day_name', ad.name,
    'entry_title', s.entry_title,
    'entered_by_trainer', s.entered_by_trainer,
    'birth_year', ath.birth_year,
    'sets_done', (SELECT count(*) FROM public.set_logs sl WHERE sl.session_log_id = s.id AND sl.done = true),
    'exercises', COALESCE(v_exercises, '[]'::jsonb)
  ) INTO v_result
  FROM public.workout_session_logs s
  CROSS JOIN LATERAL (SELECT public._normalize_hr_series(s.hr_series, s.started_at) AS ser) hr
  LEFT JOIN public.assigned_programs ap ON ap.id = s.assigned_program_id
  LEFT JOIN public.assigned_program_days ad ON ad.id = s.day_id
  LEFT JOIN public.athletes ath ON ath.id = s.athlete_id
  WHERE s.id = p_session_id;

  RETURN v_result;
END $function$
;
