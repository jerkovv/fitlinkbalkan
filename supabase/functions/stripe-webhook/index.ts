// stripe-webhook - Stripe eventi za trenersku FitLink pretplatu.
//
// Stripe salje RAW body + 'stripe-signature'. Potpis se verifikuje Stripe-ovim
// STRIPE_WEBHOOK_SECRET-om (constructEventAsync - async je OBAVEZAN u Deno; sync verzija
// puca jer SubtleCrypto nema sync API). Deploy: --no-verify-jwt (Stripe ne salje Supabase JWT).
//
// Idempotencija: svaki event.id se jednom upise u stripe_events; ponovljena isporuka (23505)
// se preskace. Ako obrada padne, red se brise da Stripe retry moze da obradi ponovo.
//
// Upis ide service_role klijentom (zaobilazi RLS) u trainer_subscriptions (onConflict trainer_id).

import Stripe from "npm:stripe@^17";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const webhookSecret = (Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '').trim();
const stripeKey = (Deno.env.get('STRIPE_SECRET_KEY') ?? '').trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(stripeKey, {
  httpClient: Stripe.createFetchHttpClient(),
});
// Deno: async verifikacija koristi WebCrypto (SubtleCrypto) preko ovog providera.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Unix sekunde -> ISO; null/undefined -> null.
const ts = (unixSeconds: number | null | undefined): string | null =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;

// Stripe sub.status -> nasa trainer_sub_status enum vrednost.
function mapStatus(s: string): string {
  switch (s) {
    case "trialing": return "trialing";
    case "active": return "active";
    case "past_due": return "past_due";
    case "unpaid": return "past_due";
    case "canceled": return "canceled";
    case "incomplete": return "incomplete";
    case "incomplete_expired": return "expired";
    default: return "incomplete";
  }
}

async function trainerIdByCustomer(customer: string): Promise<string | null> {
  const { data } = await admin
    .from("trainer_subscriptions")
    .select("trainer_id")
    .eq("stripe_customer_id", customer)
    .maybeSingle();
  return (data as { trainer_id?: string } | null)?.trainer_id ?? null;
}

async function upsertFromSubscription(
  sub: Stripe.Subscription,
  trainerId: string,
  customer: string,
) {
  const { error } = await admin.from("trainer_subscriptions").upsert(
    {
      trainer_id: trainerId,
      stripe_customer_id: customer,
      stripe_subscription_id: sub.id,
      plan: "monthly",
      status: mapStatus(sub.status),
      access_until: ts(sub.current_period_end),
      current_period_end: ts(sub.current_period_end),
      trial_ends_at: sub.trial_end ? ts(sub.trial_end) : null,
      cancel_at_period_end: sub.cancel_at_period_end,
    },
    { onConflict: "trainer_id" },
  );
  if (error) console.log("stripe-webhook: upsertFromSubscription error:", error.message);
}

// Godisnji jednokratni: 365 dana pristupa. Poziva se SAMO kad je placanje stvarno naplaceno
// (payment_status paid ili async_payment_succeeded) - nikad na sam "completed" za async metode.
async function grantYearly(session: Stripe.Checkout.Session) {
  const trainerId = session.metadata?.trainer_id;
  const customer = session.customer as string;
  if (!trainerId) {
    console.log("stripe-webhook: grantYearly bez trainer_id");
    return;
  }
  const { error } = await admin.from("trainer_subscriptions").upsert(
    {
      trainer_id: trainerId,
      stripe_customer_id: customer,
      stripe_subscription_id: null,
      plan: "yearly",
      status: "active",
      access_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      current_period_end: null,
      cancel_at_period_end: false,
      last_payment_at: new Date().toISOString(),
      amount_cents: session.amount_total,
      currency: session.currency,
    },
    { onConflict: "trainer_id" },
  );
  if (error) console.log("stripe-webhook: grantYearly upsert error:", error.message);
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const rawBody = await req.text();
  if (!sig) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      sig,
      webhookSecret,
      undefined,
      cryptoProvider,
    );
  } catch (e) {
    console.log("stripe-webhook: bad signature:", (e as Error).message);
    return new Response("Invalid signature", { status: 400 });
  }

  // Idempotencija: prvi upis event.id "zauzme" event; duplikat (23505) -> vec obradjeno.
  const { error: insErr } = await admin
    .from("stripe_events")
    .insert({ id: event.id, type: event.type, payload: event as unknown as Record<string, unknown> });
  if (insErr) {
    if ((insErr as { code?: string }).code === "23505") {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.log("stripe-webhook: stripe_events insert error:", insErr.message);
    // Ne blokiraj obradu na drugim greskama upisa audit reda.
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment") {
          // Godisnji jednokratni: dodeli SAMO ako je placanje naplaceno. Za async metode
          // (SEPA/ACH/"processing") payment_status je "unpaid" ovde -> cekaj async_payment_succeeded.
          if (session.payment_status === "paid") {
            await grantYearly(session);
          } else {
            console.log(
              "stripe-webhook: yearly completed, payment_status=" +
                session.payment_status + " -> cekam async_payment_succeeded",
            );
          }
        } else if (session.mode === "subscription") {
          const trainerId = session.metadata?.trainer_id;
          const customer = session.customer as string;
          if (!trainerId) {
            console.log("stripe-webhook: subscription checkout bez trainer_id");
            break;
          }
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await upsertFromSubscription(sub, trainerId, customer);
        }
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        // Async naplata (npr. SEPA) uspela -> tek sad dodeli godisnji pristup.
        // Subscription async naplatu vode subscription/invoice eventi, pa hvatamo samo mode payment.
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment") await grantYearly(session);
        break;
      }

      case "checkout.session.async_payment_failed": {
        // Async naplata pala -> pristup se NE dodeljuje (nista nije ni upisano na completed).
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(
          "stripe-webhook: async payment failed za session " + session.id + " - pristup nije dodeljen",
        );
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customer = sub.customer as string;
        const trainerId = sub.metadata?.trainer_id ?? (await trainerIdByCustomer(customer));
        if (!trainerId) {
          console.log("stripe-webhook: subscription.upsert bez trainer_id");
          break;
        }
        await upsertFromSubscription(sub, trainerId, customer);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customer = sub.customer as string;
        const trainerId = sub.metadata?.trainer_id ?? (await trainerIdByCustomer(customer));
        if (!trainerId) {
          console.log("stripe-webhook: subscription.deleted bez trainer_id");
          break;
        }
        await admin.from("trainer_subscriptions").upsert(
          {
            trainer_id: trainerId,
            stripe_customer_id: customer,
            stripe_subscription_id: sub.id,
            status: "canceled",
            access_until: ts(sub.current_period_end),
            cancel_at_period_end: true,
          },
          { onConflict: "trainer_id" },
        );
        break;
      }

      case "invoice.paid":
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customer = invoice.customer as string;
        const trainerId = await trainerIdByCustomer(customer);
        if (!trainerId) break;
        await admin.from("trainer_subscriptions").upsert(
          { trainer_id: trainerId, last_payment_at: new Date().toISOString() },
          { onConflict: "trainer_id" },
        );
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customer = invoice.customer as string;
        const trainerId = await trainerIdByCustomer(customer);
        if (!trainerId) break;
        await admin.from("trainer_subscriptions").upsert(
          { trainer_id: trainerId, status: "past_due" },
          { onConflict: "trainer_id" },
        );
        break;
      }

      default:
        // Ostale evente ignorisi (vec upisani u stripe_events radi audita).
        break;
    }
  } catch (e) {
    console.log("stripe-webhook: handler error:", (e as Error).message);
    // Obrada pala -> oslobodi event.id da Stripe retry moze ponovo (upsert-i su idempotentni).
    await admin.from("stripe_events").delete().eq("id", event.id);
    // Generican odgovor (detalj samo u logu); 500 da Stripe retry-uje.
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
