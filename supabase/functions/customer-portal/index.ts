// customer-portal - Stripe Billing Portal link za trenera (upravljanje pretplatom/karticom).
//
// Auth rucno (deploy --no-verify-jwt): Authorization header -> anon klijent -> getUser().
// customer id se cita iz trainer_subscriptions; bez njega nema sta da se otvori (400).

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
      .select("stripe_customer_id")
      .eq("trainer_id", user.id)
      .maybeSingle();
    const customerId = (subRow as { stripe_customer_id?: string | null } | null)?.stripe_customer_id;
    if (!customerId) return json({ error: "Nema aktivne pretplate" }, 400);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: "https://fitlink.rs/pretplata",
    });

    return json({ url: session.url });
  } catch (e) {
    // Detalj samo u logu; klijentu generican tekst (bez Stripe/DB internih poruka).
    console.log("customer-portal error:", (e as Error).message);
    return json({ error: "Došlo je do greške. Pokušaj ponovo." }, 500);
  }
});
