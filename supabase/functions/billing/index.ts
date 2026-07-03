// billing - on-site upravljanje pretplatom/karticama trenera (bez Stripe portala).
//
// Auth RUCNO (deploy --no-verify-jwt): Authorization header -> anon klijent -> getUser().
// stripe_customer_id / stripe_subscription_id se citaju iz trainer_subscriptions (service_role).
// Svaka akcija je Stripe API poziv; klijentu generican tekst greske, detalj u console.log.
//
// Body: { action, ...params }. Akcije: list-payment-methods, create-setup-intent,
// detach-payment-method, set-default-payment-method, cancel-subscription, resume-subscription,
// list-invoices.

import Stripe from "npm:stripe@^17";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripeKey = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
const stripe = new Stripe(stripeKey, {
  httpClient: Stripe.createFetchHttpClient(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Vrati payment method SAMO ako pripada ovom customer-u (inace null -> pozivalac vraca 403).
async function pmOwnedBy(pmId: string, customer: string): Promise<Stripe.PaymentMethod | null> {
  const pm = await stripe.paymentMethods.retrieve(pmId);
  const owner = typeof pm.customer === "string" ? pm.customer : (pm.customer?.id ?? null);
  return owner === customer ? pm : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: subRow } = await admin
      .from("trainer_subscriptions")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("trainer_id", user.id)
      .maybeSingle();
    const row = subRow as { stripe_customer_id?: string | null; stripe_subscription_id?: string | null } | null;
    const customer = row?.stripe_customer_id ?? null;
    const subId = row?.stripe_subscription_id ?? null;

    if (!customer) return json({ error: "Nema Stripe naloga" }, 400);

    const body = await req.json().catch(() => null);
    const action = body?.action as string | undefined;

    switch (action) {
      case "list-payment-methods": {
        const pms = await stripe.paymentMethods.list({ customer, type: "card" });
        const cust = await stripe.customers.retrieve(customer);
        const defaultPm = (cust as { invoice_settings?: { default_payment_method?: string | null } })
          ?.invoice_settings?.default_payment_method ?? null;
        return json({
          cards: pms.data.map((pm) => ({
            id: pm.id,
            brand: pm.card?.brand,
            last4: pm.card?.last4,
            exp_month: pm.card?.exp_month,
            exp_year: pm.card?.exp_year,
            is_default: pm.id === defaultPm,
          })),
        });
      }

      case "create-setup-intent": {
        const si = await stripe.setupIntents.create({
          customer,
          payment_method_types: ["card"],
          usage: "off_session",
        });
        return json({ clientSecret: si.client_secret });
      }

      case "detach-payment-method": {
        const pmId = body?.payment_method_id as string | undefined;
        if (!pmId) return json({ error: "Nedostaje payment_method_id" }, 400);
        const pm = await pmOwnedBy(pmId, customer);
        if (!pm) return json({ error: "Zabranjeno" }, 403);
        await stripe.paymentMethods.detach(pmId);
        return json({ ok: true });
      }

      case "set-default-payment-method": {
        const pmId = body?.payment_method_id as string | undefined;
        if (!pmId) return json({ error: "Nedostaje payment_method_id" }, 400);
        const pm = await pmOwnedBy(pmId, customer);
        if (!pm) return json({ error: "Zabranjeno" }, 403);
        await stripe.customers.update(customer, {
          invoice_settings: { default_payment_method: pmId },
        });
        if (subId) {
          await stripe.subscriptions.update(subId, { default_payment_method: pmId });
        }
        return json({ ok: true });
      }

      case "cancel-subscription": {
        // Godisnji jednokratni nema subscription (istice sam) -> nema sta da se otkaze.
        if (!subId) return json({ error: "Nema aktivne pretplate za otkazivanje" }, 400);
        await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
        return json({ ok: true });
      }

      case "resume-subscription": {
        if (!subId) return json({ error: "Nema aktivne pretplate" }, 400);
        await stripe.subscriptions.update(subId, { cancel_at_period_end: false });
        return json({ ok: true });
      }

      case "list-invoices": {
        const inv = await stripe.invoices.list({ customer, limit: 12 });
        return json({
          invoices: inv.data.map((i) => ({
            id: i.id,
            number: i.number,
            // Puni iznos fakture (i.total) - amount_paid je 0 za open/draft (pokazivalo 0.00).
            amount: i.total,
            currency: i.currency,
            status: i.status,
            created: i.created,
            pdf: i.invoice_pdf,
            url: i.hosted_invoice_url,
          })),
        });
      }

      default:
        return json({ error: "Nepoznata akcija" }, 400);
    }
  } catch (e) {
    // Detalj samo u logu; klijentu generican tekst (bez Stripe/DB internih poruka).
    console.log("billing error:", (e as Error).message);
    return json({ error: "Došlo je do greške. Pokušaj ponovo." }, 500);
  }
});
