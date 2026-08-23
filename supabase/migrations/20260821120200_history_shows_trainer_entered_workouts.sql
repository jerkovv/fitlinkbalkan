-- Spisak treninga nosi i to da li je trening upisao trener, i pod kojim nazivom.
--
-- Bez toga upisan trening pada u granu "nema day_name ni day_number" i vezbacu
-- pise "Slobodan trening", sto nije tacno - on je taj trening odradio u sali sa
-- trenerom, samo bez telefona.
--
-- Kolone se dodaju NA KRAJ: supabase-js vraca objekte, pa stariji ugradjeni
-- paketi jednostavno ne citaju nova polja i nastavljaju da rade kao pre.
-- Funkcija vraca TABLE, pa mora DROP + CREATE; GRANT se zato ponavlja ispod.
DROP FUNCTION IF EXISTS public.get_athlete_inapp_workouts(uuid, integer);

CREATE FUNCTION public.get_athlete_inapp_workouts(p_user_id uuid, p_limit integer DEFAULT 20)
RETURNS TABLE(
  id uuid, day_number integer, started_at timestamptz, completed_at timestamptz,
  duration_seconds integer, active_calories numeric, hr_avg integer, hr_max integer,
  total_volume_kg numeric, program_name text, day_name text, sets_done bigint,
  entry_title text, entered_by_trainer uuid
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select s.id, s.day_number, s.started_at, s.completed_at,
         s.duration_seconds, s.active_calories, s.live_hr_avg, s.live_hr_max,
         s.total_volume_kg, ap.name, ad.name,
         (select count(*) from public.set_logs sl
            where sl.session_log_id = s.id and sl.done = true),
         s.entry_title, s.entered_by_trainer
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
$$;

REVOKE ALL ON FUNCTION public.get_athlete_inapp_workouts(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_athlete_inapp_workouts(uuid, integer) TO authenticated;

-- Isto i u detaljima jednog treninga.
DO $$
DECLARE v_src text; v_new text; v_args text; v_vol char;
BEGIN
  SELECT p.prosrc, pg_get_function_arguments(p.oid), p.provolatile
    INTO v_src, v_args, v_vol
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_inapp_workout_detail';

  v_new := replace(v_src,
    $q$    'day_name', ad.name,$q$,
    $q$    'day_name', ad.name,
    'entry_title', s.entry_title,
    'entered_by_trainer', s.entered_by_trainer,$q$);

  IF v_new = v_src THEN
    RAISE EXCEPTION 'get_inapp_workout_detail: obrazac nije nadjen, funkcija nije menjana';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.get_inapp_workout_detail(%s)
     RETURNS jsonb LANGUAGE plpgsql %s SECURITY DEFINER SET search_path TO ''public'' AS %L',
    v_args,
    CASE v_vol WHEN 's' THEN 'STABLE' WHEN 'i' THEN 'IMMUTABLE' ELSE '' END,
    v_new);
END $$;
