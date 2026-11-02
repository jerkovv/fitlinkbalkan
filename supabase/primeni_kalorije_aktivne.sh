#!/bin/bash
# Kalorije iz pulsa: aktivne (bez mirovanja), kao sat i Zdravlje, i umanjene za vezbe snage.
set -euo pipefail
cd "$(dirname "$0")/.."

F=supabase/migrations/20261102130001_kalorije_aktivne_i_snaga.sql
[ -f "$F" ] || { echo "Nema fajla: $F"; exit 1; }

echo "Primenjujem aktivne kalorije na produkciji..."
supabase db query --linked -f "$F"

echo "Provera:"
supabase db query --linked "select
  (select count(*) from pg_proc where proname='_kcal_u_minutu' and pronargs=3) = 1 as nova_formula,
  (select count(*) from pg_proc where proname='_kcal_u_minutu') = 1 as stara_obrisana,
  (select prosrc ilike '%_kcal_u_minutu(v_user_id, p_hr, p_session_id)%' from pg_proc where proname='athlete_heartbeat') as traka_salje_sesiju,
  (select prosrc ilike '%_kcal_u_minutu(v_user_id, p_heart_rate, p_session_id)%' from pg_proc where proname='watch_update_workout_hr') as sat_salje_sesiju;"
echo "Gotovo. Ocekivano: sve cetiri kolone true."
