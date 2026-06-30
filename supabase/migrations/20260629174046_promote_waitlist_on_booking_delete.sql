-- Promote waitlist when a booked session_bookings row is hard-DELETEd
-- (e.g. trainer removes an athlete from a slot via removeBooking).
-- Mirrors _tg_promote_waitlist_on_cancel which only fires on UPDATE status -> cancelled.
-- Trainer removal previously freed a spot without promoting anyone; this closes that gap.
create or replace function public._tg_promote_waitlist_on_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- only a freed 'booked' seat creates an opening; deleting an already-cancelled row frees nothing
  if old.status = 'booked' then
    perform public._promote_waitlist(old.trainer_id, old.date, old.start_time, old.session_type_id);
  end if;
  return old;
end;
$function$;

drop trigger if exists trg_promote_waitlist_on_delete on public.session_bookings;
create trigger trg_promote_waitlist_on_delete
after delete on public.session_bookings
for each row
execute function public._tg_promote_waitlist_on_delete();
