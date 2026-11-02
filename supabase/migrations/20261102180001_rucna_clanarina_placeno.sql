-- Placeno / nije placeno i za clanarinu koju je trener uneo rucno (bez zahteva vezbaca).
-- Takva clanarina nema zapis o uplati, pa ga funkcija pravi pri prvoj oznaci i vezuje za
-- clanarinu; od tada se vodi kao svaka druga (zarada broji samo placeno, po paid_at).
-- Za zapis koji je napravio trener cena, naziv i trajanje se uskladjuju sa clanarinom.
CREATE OR REPLACE FUNCTION public.trainer_set_membership_paid(p_membership_id uuid, p_paid boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trainer uuid := auth.uid();
  v_m       public.memberships%ROWTYPE;
  v_pid     uuid;
  v_paid_at timestamptz;
  v_naziv   text;
  v_treninga smallint;
  v_dana    smallint;
  v_cena    int;
BEGIN
  IF v_trainer IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni'; END IF;
  PERFORM public.require_active_trainer_sub();

  SELECT * INTO v_m FROM public.memberships
   WHERE id = p_membership_id AND trainer_id = v_trainer
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Članarina ne postoji'; END IF;

  v_naziv    := COALESCE(NULLIF(btrim(v_m.plan_name), ''), 'Članarina');
  v_treninga := LEAST(GREATEST(COALESCE(v_m.sessions_total, 0), 0), 32767);
  v_dana     := LEAST(GREATEST(COALESCE(v_m.ends_on - v_m.starts_on, 0), 0), 32767);
  v_cena     := GREATEST(round(COALESCE(v_m.price, 0))::int, 0);

  IF v_m.purchase_id IS NOT NULL THEN
    UPDATE public.membership_purchases p
       SET paid_at = CASE WHEN COALESCE(p_paid, true) THEN COALESCE(p.paid_at, now()) END,
           package_name   = CASE WHEN p.notes = 'Uneo trener' THEN v_naziv    ELSE p.package_name END,
           sessions_count = CASE WHEN p.notes = 'Uneo trener' THEN v_treninga ELSE p.sessions_count END,
           duration_days  = CASE WHEN p.notes = 'Uneo trener' THEN v_dana     ELSE p.duration_days END,
           price_rsd      = CASE WHEN p.notes = 'Uneo trener' THEN v_cena     ELSE p.price_rsd END
     WHERE p.id = v_m.purchase_id AND p.trainer_id = v_trainer AND p.status = 'confirmed'
    RETURNING p.id, p.paid_at INTO v_pid, v_paid_at;
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'purchase_id', v_pid, 'paid_at', v_paid_at);
    END IF;
  END IF;

  -- Rucno uneta clanarina: zapis o uplati nastaje sada.
  INSERT INTO public.membership_purchases (
    athlete_id, trainer_id, package_id, package_name, sessions_count, duration_days,
    price_rsd, payment_method, status, requested_at, decided_at, paid_at, notes
  ) VALUES (
    v_m.athlete_id, v_trainer, NULL, v_naziv, v_treninga, v_dana,
    v_cena, 'cash', 'confirmed', now(), now(),
    CASE WHEN COALESCE(p_paid, true) THEN now() END, 'Uneo trener'
  ) RETURNING id, paid_at INTO v_pid, v_paid_at;

  UPDATE public.memberships SET purchase_id = v_pid WHERE id = v_m.id;

  RETURN jsonb_build_object('success', true, 'purchase_id', v_pid, 'paid_at', v_paid_at);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trainer_set_membership_paid(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_set_membership_paid(uuid, boolean) TO authenticated, service_role;
