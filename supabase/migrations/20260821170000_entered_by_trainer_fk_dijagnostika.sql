-- Strani kljuc ka auth.users je 23.08. NAKRATKO skinut, pa vracen. Ovde stoji
-- zapis zasto, da se sledeci put ne postavlja isto pitanje.
--
-- Te veceri je Supabase-ov Auth servis prestao da odgovara: /auth/v1/token je
-- visio preko 12 sekundi (i sa pogresnom lozinkom, gde se ocekuje 400 odmah),
-- dok je /rest/v1 kroz ISTI gateway odgovarao za ~125 ms. Posto je ovaj kljuc
-- bio jedina izmena tog dana koja uopste dodiruje auth semu, skinut je da bi se
-- sumnja proverila probom umesto raspravom.
--
-- Rezultat: auth je pao JOS JEDNOM deset minuta posle skidanja (18:11 UTC), pa
-- se digao sam (18:17). Skidanje ogranicenja deluje istog trenutka - nema kesa
-- ni zagrevanja - pa da je bio uzrok, oporavak bi bio trenutan. Nije bio.
-- Supabase je te veceri na status stranici drzao "API Gateway - Degraded
-- Performance".
--
-- Kljuc je zato vracen u prvobitno stanje. Jedan je od 73 iste vrste u semi;
-- sama ova tabela vec ima athlete_id -> auth.users.
ALTER TABLE public.workout_session_logs
  DROP CONSTRAINT IF EXISTS workout_session_logs_entered_by_trainer_fkey;

ALTER TABLE public.workout_session_logs
  ADD CONSTRAINT workout_session_logs_entered_by_trainer_fkey
  FOREIGN KEY (entered_by_trainer) REFERENCES auth.users(id) ON DELETE SET NULL;
