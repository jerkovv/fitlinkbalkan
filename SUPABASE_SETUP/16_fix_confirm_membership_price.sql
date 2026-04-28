-- 16_fix_confirm_membership_price.sql
-- Fix: confirm_membership_purchase nije punio `price` kolonu na memberships,
-- pa je INSERT pucao sa "null value in column price violates not-null constraint".
-- Pokreni u Supabase SQL Editor.

-- 1) Skini NOT NULL sa `price` (legacy polje, danas se koristi purchase_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'memberships'
       AND column_name = 'price'
       AND is_nullable = 'NO'
  ) THEN
    EXECUTE 'ALTER TABLE public.memberships ALTER COLUMN price DROP NOT NULL';
  END IF;
END $$;

-- 2) Ažuriraj RPC da puni `price` (i `price_rsd` ako postoji) iz purchase-a,
--    da bi i postojeći podaci/izveštaji ostali konzistentni.
CREATE OR REPLACE FUNCTION public.confirm_membership_purchase(
  p_purchase_id uuid,
  p_starts_on   date DEFAULT CURRENT_DATE
)
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
  v_cols   text := 'athlete_id, trainer_id, plan_name, status, starts_on, ends_on, sessions_total, sessions_used, purchase_id';
  v_vals   text := '$1, $2, $3, ''active'', $4, $5, $6, 0, $7';
BEGIN
  SELECT * INTO v_pur FROM public.membership_purchases
   WHERE id = p_purchase_id AND trainer_id = v_trainer AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Zahtev ne postoji ili nije na čekanju';
  END IF;

  -- Deaktiviraj prethodne aktivne članarine
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

  IF v_has_price THEN
    v_cols := v_cols || ', price';
    v_vals := v_vals || ', $8';
  END IF;
  IF v_has_price_rsd THEN
    v_cols := v_cols || ', price_rsd';
    v_vals := v_vals || CASE WHEN v_has_price THEN ', $8' ELSE ', $8' END;
  END IF;

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

  -- Notifikacija vežbaču
  BEGIN
    INSERT INTO public.notifications (user_id, kind, title, body, recipient_role)
    VALUES (
      v_pur.athlete_id, 'membership_activated',
      'Članarina aktivirana',
      v_pur.package_name || ' · ' || v_pur.sessions_count || ' treninga do ' ||
        to_char(p_starts_on + v_pur.duration_days, 'DD.MM.YYYY'),
      'athlete'
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_mid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_membership_purchase(uuid, date) TO authenticated;
