// send-la-push — salje JEDAN APNs Live Activity push na dati push token.
//
// FAZA 2a: samo funkcija. Okidac koji je zove (Faza 2b) dolazi kasnije; za sad se
// poziva rucno (pg_net iz SQL-a sa Bearer <service_role_key>, ili interno).
//
// Prima POST { token, contentState, event?, staleSeconds? }. Potpisuje APNs JWT
// (ES256, isti p8/key id/team id kao send-push) i salje liveactivity push.
//
// Host: kao send-push - probaj PRODUKCIJU, na BadDeviceToken padni na SANDBOX.
// Tako radi i za Xcode dev build (sandbox token) i za TestFlight (prod).
//
// Bezbednost: ista interna autorizacija kao send-push (validan service_role
// Bearer za ovaj projekat). Deploy sa --no-verify-jwt.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const APNS_PROD_HOST = "https://api.push.apple.com";
const APNS_SANDBOX_HOST = "https://api.sandbox.push.apple.com";

// ---- APNs JWT (ES256) — identicno send-push ---------------------------------

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

// ---- APNs slanje (Live Activity) --------------------------------------------

type SendResult = {
  status: number;
  reason: string | null;
  apnsId: string | null;
  body: string | null;
};

async function sendLAToHost(
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
      "apns-push-type": "liveactivity",
      "apns-priority": "10",
      "apns-expiration": "0",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let reason: string | null = null;
  let bodyText: string | null = null;
  if (res.status !== 200) {
    try {
      bodyText = await res.text();
      try {
        reason = JSON.parse(bodyText)?.reason ?? null;
      } catch {
        reason = null;
      }
    } catch {
      bodyText = null;
    }
  } else {
    await res.arrayBuffer().catch(() => undefined);
  }
  return { status: res.status, reason, apnsId: res.headers.get("apns-id"), body: bodyText };
}

// ---- Interna autorizacija — identicno send-push -----------------------------

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
  if (envKey && token === envKey) return true;

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

    // Interna autorizacija (kao send-push).
    const auth = req.headers.get("Authorization") ?? "";
    const provided = (auth.startsWith("Bearer ") ? auth.slice(7) : "").trim();
    const expected = (SERVICE_ROLE ?? "").trim();
    let projectRef = "";
    try {
      projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
    } catch {
      projectRef = "";
    }
    if (!(await isAuthorizedToken(provided, projectRef, expected))) {
      return json({ error: "Unauthorized" }, 401);
    }

    const bundleId = Deno.env.get("APNS_BUNDLE_ID");
    if (!bundleId) return json({ error: "APNS_BUNDLE_ID missing" }, 500);

    const body = await req.json().catch(() => null);
    const token: string = (body?.token ?? "").toString().trim();
    const contentState = body?.contentState;
    const event: string = (body?.event ?? "update").toString();
    const staleSeconds: number = Number.isFinite(body?.staleSeconds)
      ? Number(body.staleSeconds)
      : 60;

    if (!token) return json({ error: "token required" }, 400);
    if (!contentState || typeof contentState !== "object") {
      return json({ error: "contentState (object) required" }, 400);
    }
    if (event !== "update" && event !== "end") {
      return json({ error: "event must be 'update' or 'end'" }, 400);
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const aps: Record<string, unknown> = {
      timestamp: nowSec,
      event,
      "content-state": contentState,
      "stale-date": nowSec + staleSeconds,
    };
    if (event === "end") {
      aps["dismissal-date"] = nowSec + 5;
    }
    const payload = { aps };

    // Live Activity apns-topic = "{bundle}.push-type.liveactivity".
    const topic = `${bundleId}.push-type.liveactivity`;
    const jwt = await getApnsJwt();
    const tail = token.slice(-6);

    // Kao send-push: prod prvo, na BadDeviceToken padni na sandbox.
    let r = await sendLAToHost(APNS_PROD_HOST, token, jwt, topic, payload);
    let host = "prod";
    if (r.reason === "BadDeviceToken") {
      r = await sendLAToHost(APNS_SANDBOX_HOST, token, jwt, topic, payload);
      host = "sandbox";
    }

    console.log(
      `send-la-push: token …${tail} (${host}) event=${event} status=${r.status} reason=${r.reason} apnsId=${r.apnsId}`,
    );

    return json({
      ok: r.status === 200,
      host,
      event,
      status: r.status,
      reason: r.reason,
      apnsId: r.apnsId,
      apnsBody: r.body,
      topic,
    });
  } catch (e) {
    console.log(`send-la-push: fatal ${(e as Error).message}`);
    return json({ error: (e as Error).message }, 500);
  }
});
