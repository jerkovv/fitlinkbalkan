-- Zeleno (serija odradjena) pali ISKLJUCIVO vezbac, svojim klikom.
--
-- Kratko je postojala asimetrija u kojoj je trener smeo da zakaci a nije smeo
-- da skine tudje (20260820220000). Povlaci se po odluci: trenerov klik je
-- vezbacu pomerao ekran na sledecu seriju, a to je i dalje "diranje treninga".
--
-- Trener ostaje pri onome sto ne dira vezbacev tok:
--   * serija NIJE odradjena  -> zadaje CILJ        (trainer_set_set_target)
--   * serija JESTE odradjena -> ispravlja brojeve  (trainer_log_set, samo UPDATE)
--
-- Funkcije se BRISU, ne samo skidaju iz UI-a: RPC koji kaci ili skida zeleno,
-- ostavljen u semi, je nabijen okidac uperen bas u pravilo.
--
-- Poznata i prihvacena posledica: vezbac koji ostavi telefon u torbi i nista ne
-- klikce nema zabelezene serije - trener mu moze zadati ciljeve, ali ne i
-- oznaciti sta je uradjeno.
DROP FUNCTION IF EXISTS public.trainer_mark_set_done(uuid, uuid, integer, integer, numeric);
DROP FUNCTION IF EXISTS public.trainer_unmark_set(uuid, uuid, integer);
