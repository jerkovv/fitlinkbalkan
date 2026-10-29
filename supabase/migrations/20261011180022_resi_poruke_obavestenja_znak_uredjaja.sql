-- Znak uredjaja (APNs/FCM) je jedinstven po telefonu. Kad prethodni nalog ne
-- stigne da obrise svoj red (odjava bez veze, istekla prijava), sledeci nalog na
-- istom telefonu nije mogao da ga preuzme: RLS odbije upsert nad tudjim redom,
-- pa novi nalog ne dobija obavestenja, a stara i dalje stizu. Ova funkcija
-- prebacuje red na onoga ko je sada prijavljen. Telefon pripada onome ko je na
-- njemu prijavljen, zato prethodni vlasnik reda gubi znak.
CREATE OR REPLACE FUNCTION public.register_push_token(
  p_token text,
  p_platform text DEFAULT 'ios',
  p_bundle text DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_platform text := lower(coalesce(nullif(btrim(p_platform), ''), 'ios'));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  -- Znak je dug i nasumican; kratak ili ogroman tekst nije znak uredjaja.
  IF p_token IS NULL OR length(p_token) < 32 OR length(p_token) > 4096 THEN
    RAISE EXCEPTION 'invalid token' USING ERRCODE = '22023';
  END IF;
  IF v_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'invalid platform' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.device_push_tokens AS d (user_id, token, platform, bundle, updated_at)
  VALUES (v_uid, p_token, v_platform,
          coalesce(nullif(btrim(p_bundle), ''), 'rs.fitlink.app'), now())
  ON CONFLICT (token) DO UPDATE
    SET user_id    = EXCLUDED.user_id,
        platform   = EXCLUDED.platform,
        -- Bez poslatog paketa ostaje onaj koji je vec upisan uz znak.
        bundle     = coalesce(nullif(btrim(p_bundle), ''), d.bundle),
        updated_at = now();
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.register_push_token(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text, text) TO authenticated;
