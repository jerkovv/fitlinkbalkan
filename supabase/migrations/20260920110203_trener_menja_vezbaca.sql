-- Već primenjeno na bazu preko MCP; ovaj fajl je samo za version control.
--
-- Trener uredjuje podatke svog vezbaca (ime, telefon, slika, godiste, pol, visina,
-- tezina, cilj, beleska) i sme da otpremi sliku u folder tog vezbaca.
-- profiles_update_own pusta samo vlasnika naloga, pa ime/telefon/slika idu kroz RPC.

-- Pomocna: da li objekat u kofi avatars pripada folderu mog vezbaca.
CREATE OR REPLACE FUNCTION public._avatar_mog_vezbaca(p_ime text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_folder text := split_part(p_ime, '/', 1);
BEGIN
  IF v_folder !~ '^[0-9a-fA-F-]{36}$' THEN
    RETURN false;
  END IF;
  RETURN public.is_my_athlete(auth.uid(), v_folder::uuid);
END;
$$;
REVOKE EXECUTE ON FUNCTION public._avatar_mog_vezbaca(text) FROM PUBLIC, anon;
-- RLS izraz se izvrsava kao prijavljeni korisnik, pa pomocna funkcija iz pravila
-- mora da bude izvrsiva za authenticated (vraca samo true/false o svom vezbacu).
GRANT EXECUTE ON FUNCTION public._avatar_mog_vezbaca(text) TO authenticated;

CREATE POLICY "avatar trener vezbaca insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND public.can_trainer_write() AND public._avatar_mog_vezbaca(name));
CREATE POLICY "avatar trener vezbaca update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND public._avatar_mog_vezbaca(name))
  WITH CHECK (bucket_id = 'avatars' AND public.can_trainer_write() AND public._avatar_mog_vezbaca(name));
CREATE POLICY "avatar trener vezbaca select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND public._avatar_mog_vezbaca(name));

-- Izmena podataka vezbaca. U p_izmene idu samo kljucevi koji se menjaju;
-- JSON null brise vrednost, a kljuc koji nije poslat se ne dira.
CREATE OR REPLACE FUNCTION public.trainer_update_athlete(p_athlete_id uuid, p_izmene jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trener uuid := auth.uid();
  v_ova int := extract(year FROM (now() AT TIME ZONE 'Europe/Belgrade'))::int;
  v_godina int;
  v_visina numeric;
  v_tezina numeric;
  v_pol text;
  v_cilj text;
  v_slika text;
BEGIN
  IF v_trener IS NULL THEN
    RAISE EXCEPTION 'Niste prijavljeni';
  END IF;
  PERFORM public.require_active_trainer_sub();
  IF NOT public.is_my_athlete(v_trener, p_athlete_id) THEN
    RAISE EXCEPTION 'Nije tvoj vežbač';
  END IF;
  IF p_izmene IS NULL OR jsonb_typeof(p_izmene) <> 'object' THEN
    RAISE EXCEPTION 'Nema izmena';
  END IF;

  IF p_izmene ? 'birth_year' AND p_izmene->>'birth_year' IS NOT NULL THEN
    v_godina := (p_izmene->>'birth_year')::int;
    IF v_godina < 1920 OR v_godina > v_ova - 8 THEN
      RAISE EXCEPTION 'Godina rođenja mora biti između 1920 i %', v_ova - 8;
    END IF;
  END IF;
  IF p_izmene ? 'height_cm' AND p_izmene->>'height_cm' IS NOT NULL THEN
    v_visina := (p_izmene->>'height_cm')::numeric;
    IF v_visina < 100 OR v_visina > 250 THEN RAISE EXCEPTION 'Visina mora biti između 100 i 250 cm'; END IF;
  END IF;
  IF p_izmene ? 'weight_kg' AND p_izmene->>'weight_kg' IS NOT NULL THEN
    v_tezina := (p_izmene->>'weight_kg')::numeric;
    IF v_tezina < 30 OR v_tezina > 300 THEN RAISE EXCEPTION 'Težina mora biti između 30 i 300 kg'; END IF;
  END IF;
  IF p_izmene ? 'gender' AND p_izmene->>'gender' IS NOT NULL THEN
    v_pol := p_izmene->>'gender';
    IF v_pol NOT IN ('male', 'female', 'other') THEN RAISE EXCEPTION 'Nepoznat pol'; END IF;
  END IF;
  IF p_izmene ? 'goal' AND p_izmene->>'goal' IS NOT NULL THEN
    v_cilj := p_izmene->>'goal';
    IF v_cilj NOT IN ('lose_weight', 'gain_muscle', 'endurance', 'mobility', 'general') THEN
      RAISE EXCEPTION 'Nepoznat cilj';
    END IF;
  END IF;
  -- Slika sme samo iz kofe avatars, i to iz foldera tog vezbaca.
  IF p_izmene ? 'avatar_url' AND p_izmene->>'avatar_url' IS NOT NULL THEN
    v_slika := p_izmene->>'avatar_url';
    IF v_slika NOT LIKE 'https://iyvvskywmqtudafapxdk.supabase.co/storage/v1/object/public/avatars/'
                        || p_athlete_id::text || '/%' THEN
      RAISE EXCEPTION 'Slika nije iz foldera ovog vežbača';
    END IF;
  END IF;
  IF length(COALESCE(p_izmene->>'full_name', '')) > 80 THEN RAISE EXCEPTION 'Ime je predugačko'; END IF;
  IF length(COALESCE(p_izmene->>'phone', '')) > 30 THEN RAISE EXCEPTION 'Telefon je predugačak'; END IF;
  IF length(COALESCE(p_izmene->>'notes', '')) > 2000 THEN RAISE EXCEPTION 'Beleška je predugačka'; END IF;

  UPDATE public.profiles p SET
    full_name = CASE WHEN p_izmene ? 'full_name' THEN NULLIF(btrim(p_izmene->>'full_name'), '') ELSE p.full_name END,
    phone = CASE WHEN p_izmene ? 'phone' THEN NULLIF(btrim(p_izmene->>'phone'), '') ELSE p.phone END,
    avatar_url = CASE WHEN p_izmene ? 'avatar_url' THEN NULLIF(p_izmene->>'avatar_url', '') ELSE p.avatar_url END,
    updated_at = now()
  WHERE p.id = p_athlete_id;

  UPDATE public.athletes a SET
    birth_year = CASE WHEN p_izmene ? 'birth_year' THEN v_godina::smallint ELSE a.birth_year END,
    gender = CASE WHEN p_izmene ? 'gender' THEN v_pol ELSE a.gender END,
    height_cm = CASE WHEN p_izmene ? 'height_cm' THEN v_visina ELSE a.height_cm END,
    weight_kg = CASE WHEN p_izmene ? 'weight_kg' THEN v_tezina ELSE a.weight_kg END,
    goal = CASE WHEN p_izmene ? 'goal' THEN v_cilj::goal_type ELSE a.goal END,
    notes = CASE WHEN p_izmene ? 'notes' THEN NULLIF(btrim(p_izmene->>'notes'), '') ELSE a.notes END
  WHERE a.id = p_athlete_id;

  RETURN jsonb_build_object('success', true, 'athlete_id', p_athlete_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trainer_update_athlete(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_update_athlete(uuid, jsonb) TO authenticated;
