-- Već primenjeno na bazu preko MCP; ovaj fajl je samo za version control.
--
-- Lista cekanja: ko je prvi kliknuo, prvi dobija mesto (_promote_waitlist redja po created_at).
-- now() je vreme pocetka transakcije; clock_timestamp() je stvarni trenutak upisa, pa ni dva
-- upisa u istoj transakciji ili u istom milisekundu ne ostavljaju redosled slucajnom id-ju.
ALTER TABLE public.session_waitlist ALTER COLUMN created_at SET DEFAULT clock_timestamp();
