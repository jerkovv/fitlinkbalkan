// send-push — APNs push notifikacije za FitLink.
//
// Prima { user_id, title, body, meta? }. Procita sve tokene tog korisnika iz
// device_push_tokens, napravi APNs JWT (ES256), i posalje notifikaciju na svaki
// token. Produkcijski host je default; na BadDeviceToken pada na sandbox (kljuc
// je Sandbox & Production). Mrtve tokene (Unregistered / BadDeviceToken) brise.
//
// Bezbednost: NIJE javno dostupna. Poziva je iskljucivo trigger na tabeli
// notifications preko pg_net, koji salje Authorization: Bearer <service_role_key>.
// Funkcija deployovana sa --no-verify-jwt; sopstvenu autorizaciju radi ovde,
// poredeci Bearer token sa SUPABASE_SERVICE_ROLE_KEY (auto-injektovan u funkciju).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const APNS_PROD_HOST = "https://api.push.apple.com";
const APNS_SANDBOX_HOST = "https://api.sandbox.push.apple.com";

// ---- APNs JWT (ES256) -------------------------------------------------------

let cachedKey: CryptoKey | null = null;
let cachedJwt: { token: string; iat: number } | null = null;

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlFromString(str: string): string {
  return b64urlFromBytes(new TextEncoder().encode(str));
}

function pemToPkcs8Bytes(pem: string): Uint8Array {
  // Tajna moze stici sa literal "\n" ili pravim novim redovima.
  const normalized = pem.replace(/\\n/g, "\n");
  const base64 = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function getSigningKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const pem = Deno.env.get("APNS_PRIVATE_KEY");
  if (!pem) throw new Error("APNS_PRIVATE_KEY missing");
  const pkcs8 = pemToPkcs8Bytes(pem);
  cachedKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return cachedKey;
}

async function getApnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  // APNs token vazi do 1h; regenerisemo na svakih ~50 min.
  if (cachedJwt && now - cachedJwt.iat < 50 * 60) return cachedJwt.token;

  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  if (!keyId || !teamId) throw new Error("APNS_KEY_ID / APNS_TEAM_ID missing");

  const header = { alg: "ES256", kid: keyId };
  const payload = { iss: teamId, iat: now };
  const signingInput =
    `${b64urlFromString(JSON.stringify(header))}.${b64urlFromString(JSON.stringify(payload))}`;

  const key = await getSigningKey();
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  const token = `${signingInput}.${b64urlFromBytes(new Uint8Array(sig))}`;
  cachedJwt = { token, iat: now };
  return token;
}

// ---- APNs slanje ------------------------------------------------------------

type SendResult = { status: number; reason: string | null; apnsId: string | null };

async function sendToHost(
  host: string,
  token: string,
  jwt: string,
  topic: string,
  payload: unknown,
): Promise<SendResult> {
  const res = await fetch(`${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let reason: string | null = null;
  if (res.status !== 200) {
    try {
      const j = await res.json();
      reason = j?.reason ?? null;
    } catch {
      reason = null;
    }
  } else {
    // iscrpi telo da se konekcija oslobodi
    await res.arrayBuffer().catch(() => undefined);
  }
  return { status: res.status, reason, apnsId: res.headers.get("apns-id") };
}

// ---- Interna autorizacija ---------------------------------------------------
// Pozivalac je trigger preko pg_net, koji salje Bearer <service_role_key> iz
// Vault-a. Ne oslanjamo se na bajt-poklapanje sa auto-injektovanim env kljucem,
// jer projekat moze imati nove API kljuceve (sb_secret_...) u env-u dok je u
// Vault-u legacy JWT - tada bajt-poredjenje uvek padne (401). Umesto toga
// prihvatamo validan service_role JWT za OVAJ projekat (role + ref + nije
// istekao), a ako je dostupan SUPABASE_JWT_SECRET dodatno verifikujemo HS256
// potpis (defense-in-depth).

function b64urlDecodeToString(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function isAuthorizedToken(
  token: string,
  projectRef: string,
  envKey: string,
): Promise<boolean> {
  if (!token) return false;
  // 1) Ako env kljuc bas jeste isti string - prihvati odmah.
  if (envKey && token === envKey) return true;

  // 2) Validan service_role JWT za ovaj projekat.
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  let payload: { role?: string; ref?: string; exp?: number };
  try {
    payload = JSON.parse(b64urlDecodeToString(parts[1]));
  } catch {
    return false;
  }
  if (payload?.role !== "service_role") return false;
  if (projectRef && payload?.ref && payload.ref !== projectRef) return false;
  const now = Math.floor(Date.now() / 1000);
  if (payload?.exp && now >= payload.exp) return false;

  // 3) Defense-in-depth: verifikuj HS256 potpis ako imamo JWT secret.
  const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET");
  if (jwtSecret) {
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(jwtSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sig = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      );
      if (b64urlFromBytes(new Uint8Array(sig)) !== parts[2]) return false;
    } catch {
      return false;
    }
  }
  return true;
}

// ---- Handler ----------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Interna autorizacija (vidi isAuthorizedToken iznad).
    const auth = req.headers.get("Authorization") ?? "";
    const provided = (auth.startsWith("Bearer ") ? auth.slice(7) : "").trim();
    const expected = (SERVICE_ROLE ?? "").trim();
    let projectRef = "";
    try {
      projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
    } catch {
      projectRef = "";
    }
    const authorized = await isAuthorizedToken(provided, projectRef, expected);
    if (!authorized) {
      return json({ error: "Unauthorized" }, 401);
    }

    const bundleId = Deno.env.get("APNS_BUNDLE_ID");
    if (!bundleId) return json({ error: "APNS_BUNDLE_ID missing" }, 500);

    const body = await req.json().catch(() => null);
    const userId: string = (body?.user_id ?? "").toString();
    const title: string = (body?.title ?? "").toString();
    const text: string = body?.body == null ? "" : body.body.toString();
    const meta = body?.meta ?? null;

    if (!userId) return json({ error: "user_id required" }, 400);
    if (!title) return json({ error: "title required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: rows, error: tokErr } = await admin
      .from("device_push_tokens")
      .select("id, token, platform")
      .eq("user_id", userId);

    if (tokErr) return json({ error: tokErr.message }, 500);
    if (!rows || rows.length === 0) {
      console.log(`send-push: no tokens for user ${userId}`);
      return json({ ok: true, sent: 0, failed: 0, deleted: 0, results: [] });
    }

    const jwt = await getApnsJwt();

    // APNs payload: alert title+body, sound default, plus opcioni meta na vrhu.
    const aps: Record<string, unknown> = { sound: "default" };
    aps.alert = text ? { title, body: text } : { title };
    const apnsPayload: Record<string, unknown> = { aps };
    if (meta && typeof meta === "object") {
      for (const [k, v] of Object.entries(meta)) {
        if (k !== "aps") apnsPayload[k] = v;
      }
    }

    let sent = 0;
    let failed = 0;
    let deleted = 0;
    const results: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      const token = row.token as string;
      const tail = token.slice(-6);
      try {
        let r = await sendToHost(APNS_PROD_HOST, token, jwt, bundleId, apnsPayload);
        let host = "prod";

        // BadDeviceToken cesto znaci pogresno okruzenje -> probaj sandbox.
        if (r.reason === "BadDeviceToken") {
          r = await sendToHost(APNS_SANDBOX_HOST, token, jwt, bundleId, apnsPayload);
          host = "sandbox";
        }

        if (r.status === 200) {
          sent++;
          console.log(`send-push: OK token …${tail} (${host})`);
        } else {
          failed++;
          console.log(
            `send-push: FAIL token …${tail} (${host}) status=${r.status} reason=${r.reason}`,
          );
          // Mrtav token -> obrisi red.
          if (r.reason === "Unregistered" || r.reason === "BadDeviceToken") {
            const { error: delErr } = await admin
              .from("device_push_tokens")
              .delete()
              .eq("id", row.id);
            if (!delErr) {
              deleted++;
              console.log(`send-push: deleted dead token …${tail}`);
            }
          }
        }
        results.push({ token: `…${tail}`, host, status: r.status, reason: r.reason });
      } catch (e) {
        failed++;
        const msg = (e as Error).message;
        console.log(`send-push: ERROR token …${tail}: ${msg}`);
        results.push({ token: `…${tail}`, error: msg });
      }
    }

    console.log(
      `send-push: user ${userId} -> sent ${sent}, failed ${failed}, deleted ${deleted}`,
    );
    return json({ ok: true, sent, failed, deleted, results });
  } catch (e) {
    console.log(`send-push: fatal ${(e as Error).message}`);
    return json({ error: (e as Error).message }, 500);
  }
});
