#!/bin/bash
# Sat dobija zbir kalorija sa servera (isti broj kao telefon i trener).
set -euo pipefail
cd "$(dirname "$0")/.."

F=supabase/migrations/20261031090001_sat_kalorije_sa_servera.sql
[ -f "$F" ] || { echo "Nema fajla: $F"; exit 1; }

echo "Primenjujem kalorije za sat na produkciji..."
supabase db query --linked -f "$F"

echo "Provera:"
supabase db query --linked "select (select prosrc ilike '%current_active_calories%' from pg_proc where proname='watch_poll_state') as sat_dobija_kalorije;"
echo "Gotovo. Ocekivano: sat_dobija_kalorije = true."
