CREATE OR REPLACE FUNCTION public.confirm_membership_purchase(p_purchase_id uuid, p_starts_on date DEFAULT CURRENT_DATE)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trainer uuid := auth.uid();
  v_pur     public.membership_purchases%ROWTYPE;
  v_mid     uuid;
  v_has_price     boolean;
  v_has_price_rsd boolean;
BEGIN
  SELECT * INTO v_pur FROM public.membership_purchases
   WHERE id = p_purchase_id AND trainer_id = v_trainer AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Zahtev ne postoji ili nije na čekanju';
  END IF;

  UPDATE public.memberships
     SET status = 'expired'
   WHERE athlete_id = v_pur.athlete_id
     AND trainer_id = v_trainer
     AND status = 'active';

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='memberships' AND column_name='price')
    INTO v_has_price;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='memberships' AND column_name='price_rsd')
    INTO v_has_price_rsd;

  IF v_has_price AND v_has_price_rsd THEN
    EXECUTE format(
      'INSERT INTO public.memberships (%s) VALUES (%s, $9) RETURNING id',
      'athlete_id, trainer_id, plan_name, status, starts_on, ends_on, sessions_total, sessions_used, purchase_id, price, price_rsd',
      '$1, $2, $3, ''active'', $4, $5, $6, 0, $7, $8'
    )
    INTO v_mid
    USING v_pur.athlete_id, v_trainer, v_pur.package_name,
          p_starts_on, p_starts_on + v_pur.duration_days,
          v_pur.sessions_count, v_pur.id, v_pur.price_rsd, v_pur.price_rsd;
  ELSIF v_has_price THEN
    EXECUTE
      'INSERT INTO public.memberships (athlete_id, trainer_id, plan_name, status, starts_on, ends_on, sessions_total, sessions_used, purchase_id, price)
       VALUES ($1,$2,$3,''active'',$4,$5,$6,0,$7,$8) RETURNING id'
    INTO v_mid
    USING v_pur.athlete_id, v_trainer, v_pur.package_name,
          p_starts_on, p_starts_on + v_pur.duration_days,
          v_pur.sessions_count, v_pur.id, v_pur.price_rsd;
  ELSIF v_has_price_rsd THEN
    EXECUTE
      'INSERT INTO public.memberships (athlete_id, trainer_id, plan_name, status, starts_on, ends_on, sessions_total, sessions_used, purchase_id, price_rsd)
       VALUES ($1,$2,$3,''active'',$4,$5,$6,0,$7,$8) RETURNING id'
    INTO v_mid
    USING v_pur.athlete_id, v_trainer, v_pur.package_name,
          p_starts_on, p_starts_on + v_pur.duration_days,
          v_pur.sessions_count, v_pur.id, v_pur.price_rsd;
  ELSE
    INSERT INTO public.memberships (
      athlete_id, trainer_id, plan_name, status,
      starts_on, ends_on, sessions_total, sessions_used, purchase_id
    ) VALUES (
      v_pur.athlete_id, v_trainer, v_pur.package_name, 'active',
      p_starts_on, p_starts_on + v_pur.duration_days,
      v_pur.sessions_count, 0, v_pur.id
    ) RETURNING id INTO v_mid;
  END IF;

  UPDATE public.membership_purchases
     SET status = 'confirmed', decided_at = now()
   WHERE id = p_purchase_id;

  BEGIN
    INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body)
    VALUES (
      v_pur.athlete_id, 'athlete', v_trainer, v_pur.athlete_id, 'membership_activated',
      'Članarina aktivirana',
      v_pur.package_name || ' · ' || v_pur.sessions_count || ' treninga do ' ||
        to_char(p_starts_on + v_pur.duration_days, 'DD.MM.YYYY')
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_mid;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_membership_purchase(p_purchase_id uuid, p_notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pur membership_purchases%ROWTYPE;
BEGIN
  SELECT * INTO v_pur FROM membership_purchases
   WHERE id = p_purchase_id AND trainer_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Zahtev ne postoji ili nije na čekanju';
  END IF;

  UPDATE membership_purchases
     SET status = 'rejected', decided_at = now(), notes = p_notes
   WHERE id = p_purchase_id;

  BEGIN
    INSERT INTO notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body)
    VALUES (
      v_pur.athlete_id, 'athlete', auth.uid(), v_pur.athlete_id, 'membership_rejected',
      'Zahtev za članarinu odbijen',
      v_pur.package_name || COALESCE(' · ' || p_notes, '')
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$$;
