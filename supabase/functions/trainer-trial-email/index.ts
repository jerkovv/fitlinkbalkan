import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  dobrodoslica, proba7, proba3, probaDanas, probaIstekla, pretplataAktivna,
  type Mejl, type Trener, type Veze,
} from "./mejlovi.ts";

// Salje treneru jedan mejl probe bez kartice (vidi mejlovi.ts za redosled).
// Zove je samo baza (pg_net) sa service_role kljucem.
// Telo: { korak, trainer_id, log_id?, kraj? }
//   korak: dobrodoslica | proba7 | proba3 | proba_danas | proba_istekla | pretplata_aktivna
//   log_id: red u dnevniku slanja; sa njim linkovi nose pracenje i odjavu. Bez njega je rucna
//   proba: obicni linkovi, nista se ne belezi.
//   kraj: samo za probu, kad nalog nema probu u bazi (ISO datum poslednjeg dana probe).

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = "FitLink <noreply@fitlink.rs>";
const SAJT = "https://fitlink.rs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KORACI: Record<string, (t: Trener, v: Veze) => Mejl> = {
  dobrodoslica,
  proba7,
  proba3,
  proba_danas: probaDanas,
  proba_istekla: probaIstekla,
  pretplata_aktivna: pretplataAktivna,
};

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
    const korak = String(payload?.korak ?? "");
    const trainerId = String(payload?.trainer_id ?? "");
    const napravi = KORACI[korak];
    if (!UUID.test(trainerId) || !napravi) return json({ error: "missing trainer_id or korak" }, 400);
    const logId: string | null = UUID.test(String(payload?.log_id ?? "")) ? String(payload.log_id) : null;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const zabelezi = async (polja: Record<string, unknown>) => {
      if (logId) await admin.from("trainer_trial_emails").update(polja).eq("id", logId);
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

    const [{ data: prof }, { data: sub }, { data: atl }, { count: programa }] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", trainerId).maybeSingle(),
      admin.from("trainer_subscriptions").select("trial_ends_at, access_until, created_at")
        .eq("trainer_id", trainerId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("athletes").select("id").eq("trainer_id", trainerId),
      admin.from("program_templates").select("id", { count: "exact", head: true }).eq("trainer_id", trainerId),
    ]);

    // Samo ime: "Zdravo Dejan", ne "Zdravo Dejan Jerkov".
    const ime = esc(String(prof?.full_name ?? "").trim().split(/\s+/)[0]);
    const zadato = payload?.kraj ? new Date(String(payload.kraj)) : null;
    const kraj = zadato && !isNaN(zadato.getTime())
      ? zadato
      : new Date(sub?.trial_ends_at ?? sub?.access_until ?? Date.now() + 30 * 86400000);
    const pocetak = new Date(kraj.getTime() - 30 * 86400000);

    const ids = (atl ?? []).map((a: { id: string }) => a.id);
    let treninga = 0;
    if (ids.length) {
      const { count } = await admin.from("workout_session_logs")
        .select("id", { count: "exact", head: true })
        .in("athlete_id", ids)
        .not("completed_at", "is", null)
        .gte("completed_at", pocetak.toISOString());
      treninga = count ?? 0;
    }

    const t: Trener = { ime, kraj, vezbaca: ids.length, treninga, programa: programa ?? 0 };
    const veze: Veze = logId
      ? {
        pretplata: `${SAJT}/api/mejl?k=${logId}`,
        piksel: `${SAJT}/api/mejl?o=${logId}`,
        odjava: `${SAJT}/odjava?t=${logId}`,
      }
      : { odjava: `${SAJT}/odjava` };
    const m = napravi(t, veze);

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
    return json({ ok: true, id, korak, vezbaca: t.vezbaca, treninga, programa: t.programa });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
