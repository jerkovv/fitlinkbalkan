#!/bin/bash
# Prebacuje Stripe sa test na zivi (live) rezim.
#
# Skripta trazi kljuceve interaktivno, ne prima ih kao argument - tako ne
# zavrse u istoriji terminala. Nista se ne ispisuje ni ne cuva lokalno.
#
# Pre pokretanja u Stripe-u (gore desno mora da pise Live, ne Test):
#   1. Nalog mora biti aktiviran - podaci o firmi i racun za isplatu
#   2. Developers -> API keys -> Secret key (sk_live_...)
#   3. Developers -> Webhooks -> Add endpoint:
#        URL: https://iyvvskywmqtudafapxdk.supabase.co/functions/v1/stripe-webhook
#        Dogadjaji: checkout.session.completed
#                   checkout.session.async_payment_succeeded
#                   checkout.session.async_payment_failed
#                   customer.subscription.created
#                   customer.subscription.updated
#                   customer.subscription.deleted
#                   invoice.paid
#                   invoice.payment_succeeded
#                   invoice.payment_failed
#      pa uzmi Signing secret (whsec_...)

set -e

PROJEKAT="iyvvskywmqtudafapxdk"

echo "Prebacivanje Stripe-a na zivi rezim."
echo "Kljucevi se NE prikazuju dok kucas i nigde se ne cuvaju."
echo

read -rsp "Secret key (sk_live_...): " SK; echo
read -rsp "Webhook signing secret (whsec_...): " WH; echo
echo

case "$SK" in
  sk_live_*) ;;
  sk_test_*) echo "To je TEST kljuc (sk_test_). Prebaci Stripe u Live rezim."; exit 1 ;;
  *)         echo "Ne lici na Stripe secret key."; exit 1 ;;
esac
case "$WH" in
  whsec_*) ;;
  *) echo "Ne lici na webhook signing secret (whsec_...)."; exit 1 ;;
esac

echo "Postavljam tajne na projekat $PROJEKAT..."
supabase secrets set --project-ref "$PROJEKAT" \
  STRIPE_SECRET_KEY="$SK" \
  STRIPE_WEBHOOK_SECRET="$WH"

unset SK WH

echo
echo "Gotovo. Provera (vrednosti se ne prikazuju, samo imena):"
supabase secrets list --project-ref "$PROJEKAT" | grep -i stripe || true
echo
echo "Preostaje jos, i BEZ toga naplata ne radi:"
echo "  1. Napravi oba proizvoda u ZIVOM rezimu i upisi nove prod_ ID-jeve"
echo "     u tabelu billing_plans (test ID-jevi ne postoje u live rezimu)."
echo "  2. Obrisi test customer/subscription ID-jeve iz trainer_subscriptions."
