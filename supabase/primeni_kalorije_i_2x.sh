#!/bin/bash
# Primenjuje dve serverske izmene u produkciji, u jednoj transakciji:
#   1) kalorije iz glavnog izvora pulsa (traka, pa sat, pa telefon)
#   2) "2x kg" po ruci (npr. bucice)
# Ako bilo sta pukne, nista se ne primeni.
set -euo pipefail
cd "$(dirname "$0")/.."

A=supabase/migrations/20261029190001_kalorije_iz_glavnog_izvora.sql
B=supabase/migrations/20261029190002_kg_po_ruci.sql
for f in "$A" "$B"; do
  [ -f "$f" ] || { echo "Nema fajla: $f"; exit 1; }
done

TMP=$(mktemp -t fitlink_migracija).sql
{
  echo "BEGIN;"
  cat "$A"
  echo
  cat "$B"
  echo
  echo "COMMIT;"
} > "$TMP"

echo "Primenjujem kalorije i 2x kg na produkciji..."
supabase db query --linked -f "$TMP"
rm -f "$TMP"

echo "Provera:"
supabase db query --linked "select
  (select count(*) from information_schema.columns where table_schema='public' and column_name='kg_po_ruci') as kolone_kg_po_ruci,
  (select count(*) from information_schema.columns where table_schema='public' and table_name='workout_live_state' and column_name in ('kcal_at','watch_kcal_poslednje')) as kolone_kalorija,
  (select count(*) from pg_proc where proname in ('_kcal_u_minutu','trainer_set_kg_po_ruci','_set_logs_kg_po_ruci')) as nove_funkcije;"
echo "Gotovo. Ocekivano: kolone_kg_po_ruci 3, kolone_kalorija 2, nove_funkcije 3."
