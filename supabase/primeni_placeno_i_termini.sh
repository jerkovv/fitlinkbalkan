#!/bin/bash
# Clanarina placeno / nije placeno + trener upisuje klijenta ili gosta u termin.
set -euo pipefail
cd "$(dirname "$0")/.."

for F in supabase/migrations/20261102140001_clanarina_placeno.sql \
         supabase/migrations/20261102140002_trener_upisuje_u_termin.sql; do
  [ -f "$F" ] || { echo "Nema fajla: $F"; exit 1; }
  echo "Primenjujem $F ..."
  supabase db query --linked -f "$F"
done

echo "Provera:"
supabase db query --linked "select
  exists(select 1 from information_schema.columns where table_name='membership_purchases' and column_name='paid_at') as placeno_kolona,
  (select count(*) from public.membership_purchases where status='confirmed' and paid_at is null) = 0 as stare_placene,
  exists(select 1 from pg_proc where proname='confirm_membership_purchase' and pronargs=3) as potvrda_sa_izborom,
  exists(select 1 from pg_proc where proname='trainer_set_purchase_paid') as oznaci_placeno,
  exists(select 1 from information_schema.columns where table_name='session_bookings' and column_name='guest_name') as gost_kolona,
  exists(select 1 from pg_proc where proname='trainer_add_booking') as upis_u_termin,
  (select pg_get_constraintdef(oid) ilike '%booking_added_by_trainer%' from pg_constraint where conname='notifications_kind_check') as novo_obavestenje;"
echo "Gotovo. Ocekivano: sve kolone true."
