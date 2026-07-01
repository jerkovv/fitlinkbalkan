-- Popularnost vezbi: koliko cesto je vezba izabrana pri pravljenju programa
-- (assigned_program_exercises + program_template_exercises). Koristi se za redosled
-- u picker-u "Dodaj vezbe" - staple vezbe isplivaju na vrh unutar svake misicne grupe.

alter table public.exercises
  add column if not exists popularity integer not null default 0;

create or replace function public.refresh_exercise_popularity()
returns void
language sql
security definer
set search_path = public
as $$
  update public.exercises e
  set popularity = (
    select count(*)::int
    from (
      select 1 from public.assigned_program_exercises a where a.exercise_id = e.id
      union all
      select 1 from public.program_template_exercises t where t.exercise_id = e.id
    ) s
  );
$$;

revoke all on function public.refresh_exercise_popularity() from public;

select public.refresh_exercise_popularity();

create index if not exists idx_exercises_muscle_popularity
  on public.exercises (primary_muscle, popularity desc, name);

do $$
begin
  if exists (select 1 from cron.job where jobname = 'refresh-exercise-popularity') then
    perform cron.unschedule('refresh-exercise-popularity');
  end if;
  perform cron.schedule(
    'refresh-exercise-popularity',
    '0 3 * * *',
    'select public.refresh_exercise_popularity();'
  );
end $$;
