-- Bogata lista in-app treninga (simetricno sa get_athlete_workouts).
-- Vraca naziv programa/dana, datum, trajanje, kalorije, puls, tonazu, broj setova.
-- Vec primenjeno u bazi (kreirano preko MCP); ova migracija unosi definiciju u
-- version-control. Bezbedno re-runnable (CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION public.get_athlete_inapp_workouts(p_user_id uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(
   id uuid,
   day_number integer,
   started_at timestamp with time zone,
   completed_at timestamp with time zone,
   duration_seconds integer,
   active_calories numeric,
   hr_avg integer,
   hr_max integer,
   total_volume_kg numeric,
   program_name text,
   day_name text,
   sets_done bigint
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.id, s.day_number, s.started_at, s.completed_at,
         s.duration_seconds, s.active_calories, s.live_hr_avg, s.live_hr_max,
         s.total_volume_kg, ap.name, ad.name,
         (select count(*) from public.set_logs sl
            where sl.session_log_id = s.id and sl.done = true)
  from public.workout_session_logs s
  left join public.assigned_programs ap on ap.id = s.assigned_program_id
  left join public.assigned_program_days ad on ad.id = s.day_id
  where s.athlete_id = p_user_id
    and s.completed_at is not null
    and (
      p_user_id = auth.uid()
      or public.is_my_athlete(auth.uid(), p_user_id)
    )
  order by s.completed_at desc
  limit p_limit;
$function$;
