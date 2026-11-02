#!/bin/bash
# Baza je presla 500 MB zbog dnevnika zakazanih poslova (cron) i dnevnika web poziva (pg_net).
# Brise se samo dnevnik; podaci aplikacije se ne diraju.
set -euo pipefail
cd "$(dirname "$0")/.."

F=supabase/migrations/20261102170001_cron_dnevnik_ciscenje.sql
[ -f "$F" ] || { echo "Nema fajla: $F"; exit 1; }

echo "Pre ciscenja:"
supabase db query --linked "select pg_size_pretty(pg_database_size(current_database())) as baza;"

echo "Gasim probni posao i ukljucujem nocno ciscenje dnevnika..."
supabase db query --linked -f "$F"

echo "Praznim dnevnik zakazanih poslova..."
supabase db query --linked "TRUNCATE cron.job_run_details;"

echo "Praznim dnevnik web poziva..."
supabase db query --linked "TRUNCATE net._http_response;"

echo "Posle ciscenja:"
supabase db query --linked "select pg_size_pretty(pg_database_size(current_database())) as baza,
  (select count(*) from cron.job where jobname = 'fake-live-tick') = 0 as probni_ugasen,
  exists(select 1 from cron.job where jobname = 'ocisti-cron-dnevnik') as nocno_ciscenje,
  exists(select 1 from cron.job where jobname = 'la-rest-expiry-autoadvance' and active) as odmor_radi;"
echo "Gotovo. Ocekivano: baza oko 40 MB, ostale kolone true."
