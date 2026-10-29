-- Brana pretplate na tabeli memberships.
-- 28 tabela vec nosi pretplata_gate_* politike, memberships nije: trener kome je istekla
-- FitLink pretplata nije mogao da potvrdi zahtev (RPC ga odbija), ali je rucno dodavao,
-- menjao i brisao clanarine. Iste RESTRICTIVE politike kao na membership_packages.
-- can_trainer_write() vraca true za svakog ko nije trener, a funkcije koje same pisu u
-- memberships (confirm_membership_purchase, book_session, cancel_session_booking,
-- add_bonus_sessions, _promote_waitlist, fn_send_expiry_reminders) su SECURITY DEFINER
-- i RLS ih ne dotice, pa se za vezbace i za server nista ne menja.

DROP POLICY IF EXISTS pretplata_gate_ins ON public.memberships;
CREATE POLICY pretplata_gate_ins ON public.memberships
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_trainer_write());

DROP POLICY IF EXISTS pretplata_gate_upd ON public.memberships;
CREATE POLICY pretplata_gate_upd ON public.memberships
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_trainer_write())
  WITH CHECK (public.can_trainer_write());

DROP POLICY IF EXISTS pretplata_gate_del ON public.memberships;
CREATE POLICY pretplata_gate_del ON public.memberships
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_trainer_write());
