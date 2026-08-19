// create-checkout - kreira Stripe Checkout sesiju za trenersku FitLink pretplatu.
//
// Auth se radi RUCNO (deploy je --no-verify-jwt da CORS preflight ne pukne): Authorization
// header -> anon klijent -> getUser(). Cenovnik se cita iz billing_plans (service_role),
// pa se sesija pravi sa inline price_data (bez fiksnih price ID-eva; Dejan menja cene u bazi).
//
// mode: 'subscription' (mesecno, recurring + trial) ili 'payment' (godisnje jednokratno).

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

    // Caller identitet (getUser preko prosledjenog Authorization header-a).
    const authClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const plan = body?.plan;
    if (plan !== "monthly" && plan !== "yearly") return json({ error: "Neispravan plan" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Cenovnik (izvor istine za iznose).
    const { data: row } = await admin
      .from("billing_plans")
      .select("*")
      .eq("plan", plan)
      .eq("active", true)
      .maybeSingle();
    if (!row) return json({ error: "Plan trenutno nije dostupan" }, 400);

    // Obezbedi Stripe customer-a (za portal i sledece kupovine); zapamti ga u bazi.
    const { data: subRow } = await admin
      .from("trainer_subscriptions")
      .select("stripe_customer_id")
      .eq("trainer_id", user.id)
      .maybeSingle();
    let customerId: string | null | undefined = (subRow as { stripe_customer_id?: string | null } | null)
      ?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        // Fakture na srpskom; Stripe uzima prvi podrzan (fallback 'hr').
        preferred_locales: ["sr", "hr"],
        // Customer-level footer -> pojavljuje se na SVIM njegovim fakturama (mesecne i godisnje).
        invoice_settings: { footer: "Hvala sto koristis FitLink. fitlink.rs" },
        metadata: { trainer_id: user.id },
      });
      customerId = customer.id;
      await admin.from("trainer_subscriptions").upsert(
        { trainer_id: user.id, stripe_customer_id: customerId },
        { onConflict: "trainer_id" },
      );
    }

    const isSub = !!row.interval;
    const session = await stripe.checkout.sessions.create({
      mode: isSub ? "subscription" : "payment",
      customer: customerId,
      // 'sr' nije u Stripe Locale tipu (proveren stripe@17 .d.ts) -> 'hr' (latinica, cita se isto).
      locale: "hr",
      line_items: [
        {
          price_data: {
            currency: row.currency,
            unit_amount: row.amount_cents,
            product: row.stripe_product_id,
            ...(isSub ? { recurring: { interval: row.interval } } : {}),
          },
          quantity: 1,
        },
      ],
      metadata: { trainer_id: user.id, plan },
      ...(isSub
        ? {
            subscription_data: {
              metadata: { trainer_id: user.id, plan },
              ...(row.trial_days > 0 ? { trial_period_days: row.trial_days } : {}),
            },
            payment_method_collection: "always",
          }
        // Godisnji jednokratni (payment): napravi fakturu. Subscription je vec pravi -
        // invoice_creation na subscription modu baca gresku, pa ide samo u payment granu.
        : {
            // Nalog je zajednicki sa apgrejd.com, pa se opis na izvodu NE dira
            // globalno. Kod jednokratne karticne naplate Stripe ne da da se
            // zameni ceo opis, samo da se na prefiks naloga zakaci dodatak -
            // trener na izvodu vidi npr. "APGREJD* FitLink".
            // Mesecna pretplata ide drugim putem: tamo opis dolazi sa
            // proizvoda (Product.statement_descriptor), sto se podesava u
            // Stripe-u i takodje ne dira nalog.
            payment_intent_data: { statement_descriptor_suffix: "FitLink" },
            invoice_creation: {
              enabled: true,
              invoice_data: {
                description: "FitLink Trener - godisnja pretplata (12 meseci)",
                footer: "Hvala sto koristis FitLink. fitlink.rs",
              },
            },
          }),
      // Embedded Checkout on-site (bez redirecta); success_url/cancel_url se ne koriste.
      ui_mode: "embedded",
      redirect_on_completion: "never",
    });

    return json({ clientSecret: session.client_secret });
  } catch (e) {
    // Detalj samo u logu; klijentu generican tekst (bez Stripe/DB internih poruka).
    console.log("create-checkout error:", (e as Error).message);
    return json({ error: "Došlo je do greške. Pokušaj ponovo." }, 500);
  }
});
