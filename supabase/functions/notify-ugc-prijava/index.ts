// notify-ugc-prijava - mejl obavestenje o novoj UGC prijavi (fitlink.rs/ugc-kreatori).
//
// Prima { id } i salje CEO red iz ugc_prijave na adresu iz UGC_NOTIFY_EMAIL
// (podrazumevano info@fitlink.rs) preko Resend-a. Reply-To je mejl kreatora,
// pa se na prijavu odgovara direktno iz inboxa.
//
// Bezbednost: NIJE javno dostupna. Poziva je iskljucivo trigger
// trg_ugc_prijava_email preko pg_net sa Authorization: Bearer <service_role_key>.
// Deployovana bez verify_jwt; autorizacija se radi ovde, istom logikom kao
// send-push: env kljuc moze biti novi sb_secret_... dok je u Vault-u legacy
// JWT, pa bajt-poredjenje nije dovoljno - prihvata se i validan service_role
// JWT za OVAJ projekat (role + ref + exp, plus HS256 potpis ako ima secret).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NOTIFY_TO = Deno.env.get("UGC_NOTIFY_EMAIL") ?? "info@fitlink.rs";
const FROM = "FitLink <noreply@fitlink.rs>";
const ADMIN_URL = "https://admin.fitlink.rs/ugc-prijave";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Samo http(s) linkovi postaju klikabilni; sve ostalo ide kao tekst.
function link(url: string, label?: string): string {
  const u = String(url ?? "").trim();
  if (!/^https?:\/\//i.test(u)) return esc(u);
  return `<a href="${esc(u)}" style="color:#8a36e8; text-decoration:underline; word-break:break-all;">${esc(label ?? u)}</a>`;
}

// prefix: "https://instagram.com/" ili "https://tiktok.com/@"
const handleLink = (prefix: string, handle: string | null) => {
  const h = (handle ?? "").trim().replace(/^@/, "");
  return h ? link(`${prefix}${h}`, `@${h}`) : "-";
};

const eur = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === "" ? "-" : `${Number(n).toLocaleString("sr-Latn-RS")} EUR`;

const nl2br = (s: string | null | undefined) => esc(s ?? "-").replaceAll("\n", "<br>");

type Row = {
  id: string;
  created_at: string;
  ime_prezime: string;
  telefon: string;
  email: string;
  grad_drzava: string;
  instagram: string;
  tiktok: string | null;
  portfolio_link: string | null;
  linkovi_klipova: string[];
  upload_link: string | null;
  fitness_pozadina: string;
  cena_1_klip: number;
  cena_paket_3: number | null;
  cena_paket_5: number | null;
  sta_ulazi_u_cenu: string;
  rok_isporuke_dana: number;
  oprema: string | null;
  dostupnost: string;
  napomena: string | null;
};

type Field = { label: string; html: string };

function section(title: string, fields: Field[]): string {
  const rows = fields
    .map(
      (f, i) => `<tr>
      <td valign="top" style="padding:12px 18px; ${i > 0 ? "border-top:1px solid #e8e8f0; " : ""}font-size:13px; color:#8c8c99; width:38%;">${esc(f.label)}</td>
      <td valign="top" style="padding:12px 18px; ${i > 0 ? "border-top:1px solid #e8e8f0; " : ""}font-size:14px; font-weight:500; color:#16161f; line-height:1.55;">${f.html}</td>
    </tr>`,
    )
    .join("");
  return `
  <div style="height:22px; line-height:22px; font-size:0;">&nbsp;</div>
  <div style="font-size:12px; font-weight:700; letter-spacing:1.4px; text-transform:uppercase; color:#8a36e8;">${esc(title)}</div>
  <div style="height:8px; line-height:8px; font-size:0;">&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f6fa; border:1px solid #e8e8f0; border-radius:14px;">${rows}</table>`;
}

function render(r: Row): string {
  const klipovi = (r.linkovi_klipova ?? [])
    .map((u, i) => `${i + 1}. ${link(u)}`)
    .join("<br>");

  const body =
    section("Osnovno", [
      { label: "Ime i prezime", html: esc(r.ime_prezime) },
      { label: "Telefon", html: `<a href="tel:${esc(r.telefon)}" style="color:#8a36e8;">${esc(r.telefon)}</a>` },
      { label: "Email", html: `<a href="mailto:${esc(r.email)}" style="color:#8a36e8;">${esc(r.email)}</a>` },
      { label: "Grad i država", html: esc(r.grad_drzava) },
    ]) +
    section("Profili", [
      { label: "Instagram", html: handleLink("https://instagram.com/", r.instagram) },
      { label: "TikTok", html: handleLink("https://tiktok.com/@", r.tiktok) },
      { label: "Portfolio", html: r.portfolio_link ? link(r.portfolio_link) : "-" },
    ]) +
    section("Sadržaj iz fitness niše", [
      { label: "Klipovi", html: klipovi || "-" },
      { label: "Link ka fajlovima", html: r.upload_link ? link(r.upload_link) : "-" },
      { label: "Veza sa fitnesom", html: nl2br(r.fitness_pozadina) },
    ]) +
    section("Cenovnik", [
      { label: "1 klip", html: eur(r.cena_1_klip) },
      { label: "Paket od 3 klipa", html: eur(r.cena_paket_3) },
      { label: "Paket od 5 klipova", html: eur(r.cena_paket_5) },
      { label: "Šta ulazi u cenu", html: nl2br(r.sta_ulazi_u_cenu) },
      { label: "Rok isporuke", html: `${esc(r.rok_isporuke_dana)} dana` },
      { label: "Čime snima", html: esc(r.oprema ?? "-") },
      { label: "Dostupnost", html: esc(r.dostupnost) },
    ]) +
    section("Ostalo", [
      { label: "Napomena", html: nl2br(r.napomena) },
      { label: "Poslato", html: esc(new Date(r.created_at).toLocaleString("sr-Latn-RS", { timeZone: "Europe/Belgrade" })) },
      { label: "ID prijave", html: `<span style="font-family:monospace; font-size:12px;">${esc(r.id)}</span>` },
    ]);

  return `<!DOCTYPE html>
<html lang="sr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nova UGC prijava</title>
</head>
<body style="margin:0; padding:0; background-color:#ededf3; -webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ededf3;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px; max-width:640px; background-color:#ffffff; border-radius:20px; border:1px solid #e6e6ee; overflow:hidden;">
<tr><td style="padding:40px 40px 36px 40px; font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <div style="font-family:'Inter Tight',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:22px; font-weight:800; letter-spacing:-0.5px; color:#16161f;">Fit<span style="color:#8a36e8;">Link</span></div>
  <div style="height:20px; line-height:20px; font-size:0;">&nbsp;</div>
  <div style="border-top:1px solid #ececf2; font-size:0; line-height:0;">&nbsp;</div>
  <div style="height:26px; line-height:26px; font-size:0;">&nbsp;</div>

  <div style="font-size:12px; font-weight:600; letter-spacing:1.2px; text-transform:uppercase; color:#8a36e8;">UGC kreatori</div>
  <div style="height:8px; line-height:8px; font-size:0;">&nbsp;</div>
  <div style="font-family:'Inter Tight',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:26px; font-weight:800; letter-spacing:-0.4px; color:#16161f; line-height:1.2;">Nova prijava: ${esc(r.ime_prezime)}</div>
  <div style="height:10px; line-height:10px; font-size:0;">&nbsp;</div>
  <div style="font-size:15px; color:#4b4b57; line-height:1.6;">${esc(r.grad_drzava)}, dostupnost: ${esc(r.dostupnost)}. Odgovor na ovaj mejl ide direktno kreatoru.</div>
  ${body}

  <div style="height:28px; line-height:28px; font-size:0;">&nbsp;</div>
  <a href="${ADMIN_URL}" style="display:inline-block; background-color:#8a36e8; background-image:linear-gradient(135deg,#8a36e8 0%,#603dea 55%,#e84bae 100%); color:#ffffff; font-family:'Inter Tight',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:15px; font-weight:600; text-decoration:none; padding:14px 30px; border-radius:12px;">Otvori u admin panelu</a>

</td></tr>
<tr><td style="padding:22px 40px 28px 40px; border-top:1px solid #eeeef4; font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="font-size:12px; color:#abacb6; line-height:1.6;">Automatska poruka sa fitlink.rs/ugc-kreatori.</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ---- Interna autorizacija (kopija iz send-push) ---------------------------

function b64urlDecodeToString(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function isAuthorizedToken(token: string): Promise<boolean> {
  if (!token) return false;
  if (SERVICE_ROLE_KEY && token === SERVICE_ROLE_KEY) return true;

  const parts = token.split(".");
  if (parts.length !== 3) return false;
  let payload: { role?: string; ref?: string; exp?: number };
  try {
    payload = JSON.parse(b64urlDecodeToString(parts[1]));
  } catch {
    return false;
  }
  if (payload?.role !== "service_role") return false;
  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  if (payload?.ref && payload.ref !== projectRef) return false;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("authorization") ?? "";
  const token = (auth.startsWith("Bearer ") ? auth.slice(7) : "").trim();
  if (!(await isAuthorizedToken(token))) return json({ error: "unauthorized" }, 401);

  try {
    const payload = await req.json().catch(() => null);
    const id = payload?.id;
    if (typeof id !== "string" || !id) return json({ error: "missing id" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await admin.from("ugc_prijave").select("*").eq("id", id).maybeSingle();
    if (error) return json({ error: "load failed", detail: error.message }, 500);
    if (!data) return json({ error: "not found" }, 404);
    const row = data as Row;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: NOTIFY_TO,
        reply_to: row.email,
        subject: `Nova UGC prijava: ${row.ime_prezime}`,
        html: render(row),
      }),
    });
    const text = await resp.text();
    if (!resp.ok) return json({ error: "resend failed", status: resp.status, body: text }, 502);

    let rid: string | null = null;
    try { rid = JSON.parse(text)?.id ?? null; } catch { /* ignore */ }
    return json({ ok: true, id: rid, to: NOTIFY_TO });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
