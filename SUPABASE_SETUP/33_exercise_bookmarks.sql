-- Bookmarks za vezbe (favoriti trenera/vezbaca)
create table if not exists public.exercise_bookmarks (
  user_id uuid references auth.users(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, exercise_id)
);

alter table public.exercise_bookmarks enable row level security;

drop policy if exists "Users manage own bookmarks" on public.exercise_bookmarks;
create policy "Users manage own bookmarks"
  on public.exercise_bookmarks for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists idx_bookmarks_user on public.exercise_bookmarks(user_id);
