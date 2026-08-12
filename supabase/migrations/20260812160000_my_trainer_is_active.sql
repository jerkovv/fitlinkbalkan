-- Da li je MOJ trener aktivan (ima vazecu FitLink pretplatu).
--
-- Vezbacu se prikazuje traka "Trener nije aktivan" cim treneru istekne pretplata:
-- trener tada ne moze da mu dodeli program, objavi plan ni potvrdi uplatu, pa je
-- postenije reci mu nego da app tiho zamre.
--
-- Zaseban RPC umesto prosirenja get_my_membership_access: menjanje RETURNS TABLE
-- trazi DROP + CREATE, a ta funkcija je na kriticnoj putanji vezbaca.
--
-- Vraca TRUE i kad vezbac nema trenera - da poruka ne iskace niotkuda. Ne otkriva
-- nista o TUDJIM trenerima: gleda iskljucivo trenera pozivaoca.
create or replace function public.my_trainer_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then true
    else coalesce(
      (
        select public.trainer_has_active_fitlink_sub(a.trainer_id)
        from public.athletes a
        where a.id = auth.uid() and a.trainer_id is not null
      ),
      true
    )
  end;
$$;

revoke all on function public.my_trainer_is_active() from public;
grant execute on function public.my_trainer_is_active() to authenticated, service_role;
