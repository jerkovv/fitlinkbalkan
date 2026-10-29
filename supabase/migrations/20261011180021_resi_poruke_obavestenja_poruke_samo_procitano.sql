-- Primalac poruke je kroz politiku "participants mark read" mogao da prepise
-- i tekst i vreme tudje poruke, jer je authenticated imao UPDATE nad celom
-- tabelom. Politika ostaje ista (ko sme da dira red), a pravo se suzava na
-- jedinu kolonu koju "procitano" menja. Obe aplikacije inace idu kroz
-- mark_thread_read (SECURITY DEFINER), pa se za njih nista ne menja; direktan
-- PATCH read_at iz starijih izdanja i dalje prolazi.
REVOKE UPDATE ON public.messages FROM anon, authenticated;
GRANT UPDATE (read_at) ON public.messages TO authenticated;
