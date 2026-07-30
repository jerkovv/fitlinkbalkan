-- 1. food_items.created_by CASCADE -> SET NULL
-- Sprecava da brisanje naloga pukne kad je namirnica koju je korisnik dodao
-- vec referencirana iz nutrition_logs (NO ACTION).
ALTER TABLE public.food_items
  DROP CONSTRAINT food_items_created_by_fkey;

ALTER TABLE public.food_items
  ADD CONSTRAINT food_items_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Samo-brisanje naloga (App Store Guideline 5.1.1(v))
CREATE OR REPLACE FUNCTION public.delete_my_account(p_confirm text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  IF p_confirm IS NULL OR lower(trim(p_confirm)) <> lower(v_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'confirm_mismatch');
  END IF;

  DELETE FROM auth.users WHERE id = v_uid;

  RETURN jsonb_build_object('success', true, 'deleted_at', now());
END
$$;

REVOKE ALL ON FUNCTION public.delete_my_account(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account(text) TO authenticated;
