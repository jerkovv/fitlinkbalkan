-- Suzavanje dve RLS politike koje su bile potpuno otvorene (qual = true).
-- Anonimni pristup se sada zadrzava SAMO kroz RPC-jeve koji vracaju uzak
-- skup kolona, umesto direktnog SELECT nad celom tabelom.

-- 1. invites: RPC koji vraca tacno ono sto Invite.tsx cita danas
--    (trainer_id, status, expires_at, email, full_name), po tacnom kodu.
CREATE OR REPLACE FUNCTION public.get_invite_by_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := nullif(btrim(coalesce(p_code, '')), '');
  v_row record;
BEGIN
  IF v_code IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT trainer_id, status::text, expires_at, email, full_name
    INTO v_row
  FROM public.invites
  WHERE lower(code) = lower(v_code)
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'trainer_id', v_row.trainer_id,
    'status', v_row.status,
    'expires_at', v_row.expires_at,
    'email', v_row.email,
    'full_name', v_row.full_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_invite_by_code(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_invite_by_code(text) TO anon, authenticated, service_role;

-- 2. Suzi trainers_public_read. Autentifikovani tokovi vec imaju svoje
--    politike (trainer reads own row, athlete reads own trainer), pa ova
--    politika ostaje SAMO za anon rolu, i to iskljucivo je gasimo -
--    anon prelazi na get_trainer_by_code / get_trainer_public_profile RPC.
DROP POLICY IF EXISTS trainers_public_read ON public.trainers;

-- 3. Suzi invites_read_by_code. Zamenjujemo je uslovom koji dozvoljava
--    SELECT samo authenticated korisnicima (InviteCode.tsx flow posle
--    verifyOtp je vec autentifikovan). Anon flow (Invite.tsx pre naloga)
--    prelazi na get_invite_by_code RPC.
DROP POLICY IF EXISTS invites_read_by_code ON public.invites;

CREATE POLICY invites_read_authenticated ON public.invites
  FOR SELECT
  TO authenticated
  USING (true);
