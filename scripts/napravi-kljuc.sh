#!/bin/bash
# Pravi upload kljuc za potpisivanje Android izdanja.
#
# Pokrece se JEDNOM. Keytool ce te pitati lozinku - ukucaj je ti, skripta je
# nigde ne cuva ni ne prikazuje.
#
# Sta nastaje:
#   android/fitlink-upload.jks       sam kljuc      (NE ide u git)
#   android/keystore.properties      lozinke        (NE ide u git)
#
# Oba su u .gitignore. Napravi rezervnu kopiju oba fajla van racunara -
# menadzer lozinki, sef, sta god. Bez njih ne mozes da posaljes azuriranje.

set -e

ANDROID_DIR="$(cd "$(dirname "$0")/../android" && pwd)"
KEYSTORE="$ANDROID_DIR/fitlink-upload.jks"
PROPS="$ANDROID_DIR/keystore.properties"
ALIAS="fitlink"

if [ -f "$KEYSTORE" ]; then
  echo "Kljuc vec postoji: $KEYSTORE"
  echo "Ako ga pravis ponovo, STARI SE GUBI i vise ne mozes da azuriras"
  echo "aplikaciju tim kljucem. Obrisi ga rucno ako si siguran."
  exit 1
fi

JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
KEYTOOL="$JAVA_HOME/bin/keytool"
[ -x "$KEYTOOL" ] || { echo "Nema keytool na $KEYTOOL"; exit 1; }

echo "Pravim kljuc za APGREJD LTD."
echo "Keytool ce traziti lozinku (najmanje 6 znakova). Zapamti je."
echo

"$KEYTOOL" -genkeypair -v \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 \
  -validity 10000 \
  -dname "CN=FitLink, O=APGREJD LTD, L=London, C=GB"

echo
echo "Kljuc napravljen: $KEYSTORE"
echo
echo "Sad upisi istu lozinku u $PROPS."
echo "Otvara se editor; zameni OVDE_LOZINKA pravom lozinkom, snimi i zatvori."
echo

cat > "$PROPS" <<EOF
# Lozinke za potpisivanje izdanja. Ovaj fajl NIJE u gitu.
# Ako koristis istu lozinku za oba (uobicajeno), upisi je na oba mesta.
storeFile=fitlink-upload.jks
storePassword=OVDE_LOZINKA
keyAlias=$ALIAS
keyPassword=OVDE_LOZINKA
EOF

"${EDITOR:-nano}" "$PROPS"

if grep -q "OVDE_LOZINKA" "$PROPS"; then
  echo
  echo "UPOZORENJE: lozinka nije upisana u $PROPS - izdanje se nece potpisati."
  exit 1
fi

echo
echo "Gotovo. Napravi rezervnu kopiju OBA fajla van racunara:"
echo "  $KEYSTORE"
echo "  $PROPS"
echo
echo "Sledece: ./gradlew bundleRelease u android/ pravi .aab za Play."
