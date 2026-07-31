CREATE OR REPLACE FUNCTION public.request_membership_purchase(
  p_package_id uuid,
  p_payment_method text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_athlete uuid := auth.uid();
  v_pkg     membership_packages%ROWTYPE;
  v_trainer uuid;
  v_id      uuid;
  v_athlete_name text;
BEGIN
  IF v_athlete IS NULL THEN
    RAISE EXCEPTION 'Niste prijavljeni';
  END IF;
  IF p_payment_method NOT IN ('cash','bank') THEN
    RAISE EXCEPTION 'Nepoznat način plaćanja';
  END IF;

  SELECT * INTO v_pkg FROM membership_packages WHERE id = p_package_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paket ne postoji ili nije aktivan';
  END IF;

  SELECT trainer_id INTO v_trainer FROM athletes WHERE id = v_athlete;
  IF v_trainer IS NULL OR v_trainer <> v_pkg.trainer_id THEN
    RAISE EXCEPTION 'Niste član ovog trenera';
  END IF;

  IF EXISTS (
    SELECT 1 FROM membership_purchases
    WHERE athlete_id = v_athlete AND package_id = p_package_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Već imaš zahtev na čekanju za ovaj paket';
  END IF;

  INSERT INTO membership_purchases (
    athlete_id, trainer_id, package_id,
    package_name, sessions_count, duration_days, price_rsd,
    payment_method, status
  ) VALUES (
    v_athlete, v_trainer, v_pkg.id,
    v_pkg.name, v_pkg.sessions_count, v_pkg.duration_days, v_pkg.price_rsd,
    p_payment_method, 'pending'
  ) RETURNING id INTO v_id;

  BEGIN
    IF public.should_notify_trainer(v_trainer, 'payments') THEN
      SELECT COALESCE(p.full_name, 'Vežbač') INTO v_athlete_name
      FROM public.profiles p WHERE p.id = v_athlete;

      INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
      VALUES (
        v_trainer, 'trainer', v_athlete, v_athlete, 'payment_request',
        v_athlete_name || ' traži članarinu',
        v_pkg.name || ' · ' || v_pkg.price_rsd || ' RSD (' ||
          CASE p_payment_method WHEN 'cash' THEN 'keš' ELSE 'račun' END || ')',
        jsonb_build_object('purchase_id', v_id, 'package_id', v_pkg.id)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_id;
END;
$$;

DROP FUNCTION IF EXISTS public.debug_request_membership(uuid, text);
