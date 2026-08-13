#!/bin/bash
# Postavlja FCM tajne na Supabase iz JSON-a servisnog naloga.
#
# Umesto rucnog lepljenja privatnog kljuca (koji ima nove redove i lako se
# pokvari kroz clipboard), skripta ga procita iz fajla koji si skinuo sa
# Firebase-a i posalje direktno.
#
# Upotreba:
#   ./scripts/postavi-fcm.sh ~/Downloads/fitlink-firebase-adminsdk-xxxxx.json

set -e

JSON="$1"
PROJEKAT="iyvvskywmqtudafapxdk"

if [ -z "$JSON" ]; then
  echo "Upotreba: $0 <putanja-do-service-account.json>"
  echo
  echo "Fajl skidas sa: Firebase konzola -> zupcanik -> Project settings"
  echo "                -> Service accounts -> Generate new private key"
  exit 1
fi

if [ ! -f "$JSON" ]; then
  echo "Nema fajla: $JSON"
  exit 1
fi

# Citanje kroz python, da se novi redovi u kljucu ne pokvare.
LINE=$(python3 - "$JSON" <<'PY'
import json, sys, shlex
d = json.load(open(sys.argv[1], encoding="utf-8"))
for k in ("project_id", "client_email", "private_key"):
    if k not in d:
        sys.exit(f"U JSON-u nema polja '{k}' - da li je to pravi service account fajl?")
print(" ".join([
    "FCM_PROJECT_ID=" + shlex.quote(d["project_id"]),
    "FCM_CLIENT_EMAIL=" + shlex.quote(d["client_email"]),
    "FCM_PRIVATE_KEY=" + shlex.quote(d["private_key"]),
]))
PY
)

echo "Postavljam tri tajne na projekat $PROJEKAT..."
eval "supabase secrets set --project-ref $PROJEKAT $LINE"

echo
echo "Gotovo. Provera (vrednosti se ne prikazuju, samo imena):"
supabase secrets list --project-ref "$PROJEKAT" | grep -i fcm || true
