// =====================================================================
// Supabase Edge Function: send-invite
// =====================================================================
// DEPLOY:
//   Opcija A — Supabase CLI:
//     supabase functions deploy send-invite --no-verify-jwt=false
//
//   Opcija B — Supabase Dashboard:
//     1. Otvori Project → Edge Functions → "Create a new function"
//     2. Naziv: send-invite
//     3. Zalepi sadržaj ovog fajla, klikni Deploy
//
// VARIJABLE OKRUŽENJA (već postoje na Supabase):
//   SUPABASE_URL                — auto
//   SUPABASE_ANON_KEY           — auto
//   SUPABASE_SERVICE_ROLE_KEY   — auto
//
// CALLER:
//   Ulogovan trener šalje POST sa { email, full_name }
//   (frontend ovo radi preko supabase.functions.invoke)
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function generateCode(len = 10) {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verifikuj korisnika (caller)
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const trainerId = userRes.user.id;

    // Body validation
    const body = await req.json().catch(() => null);
    const email: string = (body?.email ?? "").toString().trim().toLowerCase();
    const fullName: string = (body?.full_name ?? "").toString().trim();

    if (!email || !email.includes("@") || email.length > 255) {
      return new Response(JSON.stringify({ error: "Neispravan email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!fullName || fullName.length > 120) {
      return new Response(JSON.stringify({ error: "Unesi ime i prezime" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin client za role check + invite
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Caller mora biti trener
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", trainerId)
      .eq("role", "trainer")
      .maybeSingle();
    if (!roleRow) {
      return new Response(
        JSON.stringify({ error: "Samo treneri mogu da pozivaju vežbače" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 0) Otkazi sve prethodne pending pozivnice za isti email od istog trenera
    //    (sprečava dupliranje u listi "Poslate pozivnice")
    await admin
      .from("invites")
      .update({ status: "cancelled" })
      .eq("trainer_id", trainerId)
      .eq("email", email)
      .eq("status", "pending");

    // 1) Kreiraj invite (7 dana važi)
    const code = generateCode(10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: inv, error: invErr } = await admin
      .from("invites")
      .insert({
        trainer_id: trainerId,
        code,
        email,
        full_name: fullName,
        status: "pending",
        expires_at: expiresAt,
      })
      .select("id, code")
      .single();

    if (invErr) {
      return new Response(JSON.stringify({ error: invErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Šalji invite mejl preko Supabase Auth
    // VAŽNO: koristimo fiksni produkcioni domen, ne req origin
    // (jer kad se zove iz preview-a origin može biti localhost ili preview URL)
    const PUBLIC_SITE_URL = "https://fitlinkbalkan.lovable.app";
    const redirectTo = `${PUBLIC_SITE_URL}/invite/${code}`;

    const { error: emailErr } = await admin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo,
        data: {
          invite_code: code,
          trainer_id: trainerId,
          full_name: fullName,
          role: "athlete",
        },
      },
    );

    if (emailErr) {
      const msg = emailErr.message?.toLowerCase() ?? "";
      const alreadyExists =
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists");

      if (alreadyExists) {
        // User već postoji — pošalji magic link na isti /invite/:code URL.
        // Kad klikne, biće ulogovan i Invite.tsx će ga vezati za trenera.
        const { error: linkErr } = await admin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo },
        });

        if (linkErr) {
          await admin.from("invites").delete().eq("id", inv.id);
          return new Response(JSON.stringify({ error: linkErr.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // generateLink sa adminom šalje email automatski ako je SMTP podešen
      } else {
        // Pravi error — rollback
        await admin.from("invites").delete().eq("id", inv.id);
        return new Response(JSON.stringify({ error: emailErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 3) Označi sent_at
    await admin
      .from("invites")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", inv.id);

    return new Response(
      JSON.stringify({ ok: true, code, invite_url: redirectTo }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
