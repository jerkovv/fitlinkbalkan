-- 'Sa sata' lista pokazuje samo aktivnosti VAN FitLink-a. Sat treninzi koji se
-- vremenski preklapaju sa FitLink treningom (workout_session_logs) su duplikati
-- (sat ih je snimio dok je vezbac radio kroz app) i sakrivaju se.
-- Vec primenjeno u bazi (kreirano preko MCP); ova migracija unosi definiciju u
-- version-control. Bezbedno re-runnable (CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION public.get_athlete_workouts(p_user_id uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, workout_type text, started_at timestamp with time zone, duration_seconds integer, active_calories numeric, hr_avg integer, hr_max integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select w.id, w.workout_type, w.started_at, w.duration_seconds,
         w.active_calories, w.hr_avg, w.hr_max
  from public.wearable_workout_details w
  where w.user_id = p_user_id
    and (
      p_user_id = auth.uid()
      or public.is_my_athlete(auth.uid(), p_user_id)
    )
    and not exists (
      select 1
      from public.workout_session_logs wsl
      where wsl.athlete_id = p_user_id
        and wsl.completed_at is not null
        and wsl.started_at < coalesce(w.ended_at, w.started_at + make_interval(secs => coalesce(w.duration_seconds, 0)))
        and wsl.completed_at > w.started_at
    )
  order by w.started_at desc
  limit p_limit;
$function$;
