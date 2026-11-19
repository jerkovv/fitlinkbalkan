import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mejl1, mejl2 } from "./mejlovi.ts";

// Salje treneru podsetnik da pokrene pretplatu: korak 1 (istog dana) ili korak 2 (posle tri dana).
// Zove je samo baza (pg_net) sa service_role kljucem: _posalji_mejlove_povratka po rasporedu.
// Telo: { step: 1 | 2, trainer_id: uuid, log_id?: uuid }. log_id je red u trainer_recovery_emails;
// sa njim linkovi nose pracenje klika, otvaranja i odjavu, a ishod slanja se upisuje u taj red.
// Bez log_id je rucna proba: obicni linkovi, nista se ne belezi.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = "FitLink <noreply@fitlink.rs>";
const SAJT = "https://fitlink.rs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

// ---- Interna autorizacija (kopija iz send-push) ------------------------------
// Baza salje Bearer <service_role_key> iz Vault-a. Ne poredimo bajt-po-bajt sa env kljucem
// (env moze imati sb_secret_, a Vault legacy JWT); prihvatamo validan service_role JWT za ovaj
// projekat, a uz SUPABASE_JWT_SECRET proveravamo i HS256 potpis.

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecodeToString(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function isAuthorizedToken(token: string, projectRef: string, envKey: string): Promise<boolean> {
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
      const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
      if (b64urlFromBytes(new Uint8Array(sig)) !== parts[2]) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function esc(s: unknown): string {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const provided = (auth.startsWith("Bearer ") ? auth.slice(7) : "").trim();
    let projectRef = "";
    try {
      projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
    } catch {
      projectRef = "";
    }
    if (!(await isAuthorizedToken(provided, projectRef, (SERVICE_ROLE_KEY ?? "").trim()))) {
      return json({ error: "Unauthorized" }, 401);
    }

    const payload = await req.json().catch(() => null);
    const step = Number(payload?.step);
    const trainerId = payload?.trainer_id;
    if (!trainerId || (step !== 1 && step !== 2)) return json({ error: "missing trainer_id or step" }, 400);
    const logId: string | null = UUID.test(String(payload?.log_id ?? "")) ? String(payload.log_id) : null;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    // Ishod slanja ide u dnevnik, da admin vidi i mejl koji nije otisao.
    const zabelezi = async (polja: Record<string, unknown>) => {
      if (logId) await admin.from("trainer_recovery_emails").update(polja).eq("id", logId);
    };
    const { data: ures, error: uerr } = await admin.auth.admin.getUserById(trainerId);
    if (uerr) {
      await zabelezi({ greska: "nalog nije nadjen" });
      return json({ error: "getUser failed", detail: uerr.message }, 500);
    }
    const email = ures?.user?.email;
    if (!email) {
      await zabelezi({ greska: "nalog nema mejl" });
      return json({ error: "trainer has no email" }, 404);
    }

    const { data: prof } = await admin.from("profiles").select("full_name").eq("id", trainerId).maybeSingle();
    // Samo ime: "Zdravo Dejan", ne "Zdravo Dejan Jerkov".
    const ime = esc(String(prof?.full_name ?? "").trim().split(/\s+/)[0]);

    const veze = logId
      ? { pretplata: `${SAJT}/api/mejl?k=${logId}`, piksel: `${SAJT}/api/mejl?o=${logId}`, odjava: `${SAJT}/odjava?t=${logId}` }
      : { odjava: `${SAJT}/odjava` };
    const m = step === 1 ? mejl1(ime, veze) : mejl2(ime, veze);
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: email,
        subject: m.tema,
        html: m.html,
        ...(logId ? { headers: { "List-Unsubscribe": `<${veze.odjava}>` } } : {}),
      }),
    });
    const text = await resp.text();
    if (!resp.ok) {
      await zabelezi({ greska: `resend ${resp.status}` });
      return json({ error: "resend failed", status: resp.status, body: text }, 502);
    }

    let id: string | null = null;
    try { id = JSON.parse(text)?.id ?? null; } catch { /* ignore */ }
    await zabelezi({ resend_id: id, greska: null });
    return json({ ok: true, id, step });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
