-- Vraca minimum podataka o treneru na osnovu koda pozivnice ili licnog
-- koda trenera. Koristi ga javna stranica za registraciju na fitlink.rs,
-- da ne bi citala invites, trainers i profiles direktno.

CREATE OR REPLACE FUNCTION public.get_trainer_by_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := nullif(btrim(coalesce(p_code, '')), '');
  v_trainer uuid;
  v_izvor text;
  v_ime text;
BEGIN
  IF v_code IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'empty_code');
  END IF;

  SELECT i.trainer_id INTO v_trainer
  FROM public.invites i
  WHERE lower(i.code) = lower(v_code)
    AND i.status = 'pending'
    AND (i.expires_at IS NULL OR i.expires_at > now())
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF v_trainer IS NOT NULL THEN
    v_izvor := 'invite';
  ELSE
    SELECT t.id INTO v_trainer
    FROM public.trainers t
    WHERE t.invite_code = v_code
    LIMIT 1;
    IF v_trainer IS NOT NULL THEN
      v_izvor := 'trainer';
    END IF;
  END IF;

  IF v_trainer IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'not_found');
  END IF;

  SELECT nullif(btrim(coalesce(p.full_name, '')), '') INTO v_ime
  FROM public.profiles p
  WHERE p.id = v_trainer;

  RETURN jsonb_build_object(
    'valid', true,
    'source', v_izvor,
    'trainer_id', v_trainer,
    'full_name', v_ime,
    'studio_name', (SELECT studio_name FROM public.trainers WHERE id = v_trainer),
    'city', (SELECT city FROM public.trainers WHERE id = v_trainer)
  );
END
$$;

REVOKE ALL ON FUNCTION public.get_trainer_by_code(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_trainer_by_code(text) TO anon, authenticated, service_role;
