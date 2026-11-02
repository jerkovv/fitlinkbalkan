-- Dnevnik zakazanih poslova (cron.job_run_details) je narastao na oko 600 MB i probio
-- granicu baze od 500 MB. Posao na 15 s (la-rest-expiry-autoadvance) i probni posao na
-- 10 s (fake-live-tick) upisivali su oko 14.000 redova dnevno, bez ikakvog ciscenja.

-- Probni posao od 2026-10-11 (lazni puls za pet demo treninga). Rok mu je istekao istog
-- dana, pa vise nista ne menja, a i dalje se pokrece svakih 10 s.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'fake-live-tick';

-- Dnevnik se cisti svake noci: ostaju poslednja 2 dana, dovoljno za proveru gresaka.
SELECT cron.schedule('ocisti-cron-dnevnik', '17 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '2 days'$$);
