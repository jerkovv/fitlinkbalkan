-- Admin moze da obrise UGC prijavu (admin.fitlink.rs/ugc-prijave).
-- Isti mehanizam kao citanje i promena statusa: is_admin() kroz RLS.

GRANT DELETE ON public.ugc_prijave TO authenticated;

DROP POLICY IF EXISTS "Admin brise UGC prijave" ON public.ugc_prijave;
CREATE POLICY "Admin brise UGC prijave"
ON public.ugc_prijave FOR DELETE
TO authenticated
USING (public.is_admin());
