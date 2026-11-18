import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = "https://app.fitlink.rs";
// Trener placa FitLink na sajtu, ne u aplikaciji (mejl sme da nosi link, aplikacija ne).
const BILLING_URL = "https://fitlink.rs/pretplata";
const FROM = "FitLink <noreply@fitlink.rs>";
// Zvanican logo kao slika (natpis se ne kuca fontom). Dve verzije: tamna slova za svetlu
// karticu i svetla slova za tamnu temu; klijent bira kroz prefers-color-scheme.
const LOGO_SVETLA = "https://fitlink.rs/slike/mejl-logo-svetla.png";
const LOGO_TAMNA = "https://fitlink.rs/slike/mejl-logo-tamna.png";

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
    .replaceAll(">", "&gt;");
}

function fmtDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const parts = String(s).slice(0, 10).split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  return `${d}.${m}.${y}.`;
}

type Row = { label: string; value: string };
// titleHtml: naslov koraka kao gotov HTML, kad nosi link. Adresa napisana kao obican tekst
// u Apple Mail-u sama postane plav podvucen link; zato je svaka adresa ili pravi link ili je nema.
type Step = { title: string; text: string; titleHtml?: string };

// ---- Interna autorizacija (kopija iz send-push) ------------------------------
// Pozivalac je baza preko pg_net, koja salje Bearer <service_role_key> iz Vault-a.
// Ne poredimo bajt-po-bajt sa env kljucem (env moze imati sb_secret_, a Vault
// legacy JWT); prihvatamo validan service_role JWT za ovaj projekat, a uz
// SUPABASE_JWT_SECRET proveravamo i HS256 potpis.

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

type Pretplata = { access_until?: string | null; probni?: boolean | null; vezbaca?: number | null };

/** 2, 3, 4 (ali ne 12-14) traze "gube", ostali "gubi". */
function gube(n: number): boolean {
  return n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14);
}

/** "1 vežbač", "3 vežbača", "12 vežbača". */
function vezbaca(n: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? `${n} vežbač` : `${n} vežbača`;
}

function renderTemplate(o: {
  previewText: string;
  eyebrow: string;
  heading: string;
  bodyHtml: string;
  rows: Row[];
  ctaText: string;
  ctaUrl: string;
  /** Numerisani koraci umesto tabele (mejl posle potvrde naloga). */
  steps?: Step[];
  /** Sitan tekst ispod dugmeta; vec gotov HTML. */
  noteHtml?: string;
  /** Dugme preko cele sirine. */
  ctaBlock?: boolean;
  /** Potpis u dnu; podrazumevan je onaj za vezbace. */
  footer?: string;
}): string {
  const rowsHtml = o.rows.length
    ? `
  <div style="height:26px; line-height:26px; font-size:0;">&nbsp;</div>
  <table role="presentation" class="panel" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f6fa; border:1px solid #e8e8f0; border-radius:14px;">
    ${o.rows
      .map(
        (r, i) => `<tr>
      <td class="${i > 0 ? "hairline t-muted" : "t-muted"}" style="padding:14px 20px; ${i > 0 ? "border-top:1px solid #e8e8f0; " : ""}font-size:13px; color:#8c8c99;">${esc(r.label)}</td>
      <td align="right" class="${i > 0 ? "hairline t-primary" : "t-primary"}" style="padding:14px 20px; ${i > 0 ? "border-top:1px solid #e8e8f0; " : ""}font-size:14px; font-weight:600; color:#16161f;">${esc(r.value)}</td>
    </tr>`
      )
      .join("")}
  </table>`
    : "";

  const ctaHtml = o.ctaUrl
    ? `
  <div style="height:28px; line-height:28px; font-size:0;">&nbsp;</div>
  <a href="${o.ctaUrl}" style="display:${o.ctaBlock ? "block; text-align:center" : "inline-block"}; background-color:#8a36e8; background-image:linear-gradient(135deg,#8a36e8 0%,#603dea 55%,#e84bae 100%); color:#ffffff; font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:15px; font-weight:600; text-decoration:none; padding:15px 32px; border-radius:12px; box-shadow:0 8px 22px -8px rgba(138,54,232,0.5);">${esc(o.ctaText)}</a>`
    : "";

  const stepsHtml = o.steps?.length
    ? `
  <div style="height:24px; line-height:24px; font-size:0;">&nbsp;</div>
  <table role="presentation" class="panel" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f6fa; border:1px solid #e8e8f0; border-radius:14px;">
    ${o.steps
      .map(
        (k, i) => `<tr>
      <td valign="top" width="44" class="${i > 0 ? "hairline" : ""}" style="padding:16px 0 16px 18px; ${i > 0 ? "border-top:1px solid #e8e8f0;" : ""}">
        <div class="krug" style="width:28px; height:28px; border-radius:14px; background-color:#efe6fd; color:#8a36e8; font-size:13px; font-weight:600; line-height:28px; text-align:center;">${i + 1}</div>
      </td>
      <td valign="top" class="${i > 0 ? "hairline" : ""}" style="padding:16px 18px 16px 12px; ${i > 0 ? "border-top:1px solid #e8e8f0;" : ""}">
        <div class="t-primary" style="font-size:15px; font-weight:600; color:#16161f; line-height:1.35;">${k.titleHtml ?? esc(k.title)}</div>
        <div class="t-muted" style="font-size:13px; color:#8c8c99; line-height:1.55; padding-top:2px;">${esc(k.text)}</div>
      </td>
    </tr>`
      )
      .join("")}
  </table>`
    : "";

  const noteHtml = o.noteHtml
    ? `
  <div style="height:18px; line-height:18px; font-size:0;">&nbsp;</div>
  <div class="t-muted" style="font-size:13px; color:#8c8c99; line-height:1.6;">${o.noteHtml}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="sr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FitLink</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .email-bg { background-color: #0d0d12 !important; }
    .email-card { background-color: #14141a !important; border-color: #292932 !important; }
    .t-primary { color: #f3f3f7 !important; }
    .t-body { color: #c2c2cd !important; }
    .t-muted { color: #9a9aa6 !important; }
    .t-footer { color: #74747f !important; }
    .panel { background-color: #1b1b22 !important; border-color: #292932 !important; }
    .hairline { border-color: #292932 !important; }
    .krug { background-color: #2a2140 !important; color: #b58cff !important; }
    .t-accent { color: #b58cff !important; }
    .logo-svetla { display: none !important; }
    .logo-tamna { display: block !important; }
  }
  @media (max-width: 620px) {
    .pad { padding: 32px 26px 30px 26px !important; }
    .pad-foot { padding: 20px 26px 24px 26px !important; }
    .email-wrap { padding: 18px 14px !important; }
  }
</style>
</head>
<body class="email-bg" style="margin:0; padding:0; background-color:#ededf3; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${esc(o.previewText)}</div>

<table role="presentation" class="email-bg" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ededf3;">
<tr>
<td align="center" class="email-wrap" style="padding:40px 16px;">

<table role="presentation" class="email-card" width="600" cellpadding="0" cellspacing="0" style="width:100%; max-width:600px; background-color:#ffffff; border-radius:20px; border:1px solid #e6e6ee; box-shadow:0 4px 28px rgba(22,22,38,0.07); overflow:hidden;">

<tr><td class="pad" style="padding:44px 44px 38px 44px; font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <img class="logo-svetla" src="${LOGO_SVETLA}" width="148" height="25" alt="FitLink" style="display:block; border:0; outline:none; width:148px; height:25px; margin-left:-2px;">
  <!--[if !mso]><!--><img class="logo-tamna" src="${LOGO_TAMNA}" width="148" height="25" alt="FitLink" style="display:none; border:0; outline:none; width:148px; height:25px; margin-left:-2px;"><!--<![endif]-->

  <div style="height:22px; line-height:22px; font-size:0;">&nbsp;</div>
  <div class="hairline" style="border-top:1px solid #ececf2; font-size:0; line-height:0;">&nbsp;</div>
  <div style="height:30px; line-height:30px; font-size:0;">&nbsp;</div>

  <div class="t-accent" style="font-size:12px; font-weight:600; letter-spacing:1.2px; text-transform:uppercase; color:#8a36e8;">${esc(o.eyebrow)}</div>
  <div style="height:8px; line-height:8px; font-size:0;">&nbsp;</div>
  <div class="t-primary" style="font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:24px; font-weight:600; letter-spacing:-0.4px; color:#16161f; line-height:1.25;">${esc(o.heading)}</div>

  <div style="height:14px; line-height:14px; font-size:0;">&nbsp;</div>
  <div class="t-body" style="font-size:15px; color:#4b4b57; line-height:1.7;">${o.bodyHtml}</div>
${rowsHtml}
${stepsHtml}
${ctaHtml}
${noteHtml}

</td></tr>

<tr><td class="hairline pad-foot" style="padding:24px 44px 30px 44px; border-top:1px solid #eeeef4; font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div class="t-muted" style="font-size:13px; color:#8c8c99; line-height:1.6;">${esc(o.footer ?? "FitLink, tvoj trening na jednom mestu.")}</div>
  <div style="height:3px; line-height:3px; font-size:0;">&nbsp;</div>
  <div class="t-footer" style="font-size:12px; color:#abacb6; line-height:1.6;">Ovo je automatska poruka, ne odgovaraj na ovaj mejl.</div>
</td></tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;
}

function buildEmail(
  event: string,
  name: string | null,
  m: { plan_name?: string; ends_on?: string | null; sessions_total?: number | null; price?: number | null },
  daysLeft?: number,
  sub: Pretplata = {}
): { subject: string; html: string } | null {
  // Samo ime: "Zdravo Dejan", ne "Zdravo Dejan Jerkov".
  const ime = (name ?? "").trim().split(/\s+/)[0];
  const greet = ime ? `Zdravo ${esc(ime)}, ` : "Zdravo, ";
  const endsFmt = fmtDate(m.ends_on);

  if (event === "membership_activated") {
    const rows: Row[] = [];
    if (m.plan_name) rows.push({ label: "Plan", value: m.plan_name });
    if (m.sessions_total != null) rows.push({ label: "Treninzi", value: String(m.sessions_total) });
    if (endsFmt) rows.push({ label: "Važi do", value: endsFmt });
    return {
      subject: "Tvoja članarina je aktivna",
      html: renderTemplate({
        previewText: "Tvoja članarina je aktivna.",
        eyebrow: "Članarina",
        heading: "Članarina je aktivna",
        bodyHtml: `${greet}tvoja članarina je aktivna i možeš da nastaviš sa treninzima. Detalji su ispod.`,
        rows,
        ctaText: "Otvori FitLink",
        ctaUrl: APP_URL,
      }),
    };
  }

  if (event === "membership_expiring") {
    const dl = typeof daysLeft === "number" ? daysLeft : 3;
    let subject: string;
    if (dl <= 0) subject = "Članarina ti ističe danas";
    else if (dl === 1) subject = "Članarina ti ističe za 1 dan";
    else subject = `Članarina ti ističe za ${dl} dana`;
    const rows: Row[] = [];
    if (m.plan_name) rows.push({ label: "Plan", value: m.plan_name });
    if (endsFmt) rows.push({ label: "Ističe", value: endsFmt });
    return {
      subject,
      html: renderTemplate({
        previewText: "Tvoja članarina uskoro ističe.",
        eyebrow: "Podsetnik",
        heading: "Članarina uskoro ističe",
        bodyHtml: `${greet}tvoja članarina ističe ${endsFmt || "uskoro"}. Javi se treneru da je obnoviš i nastaviš trening bez prekida.`,
        rows,
        ctaText: "Otvori FitLink",
        ctaUrl: APP_URL,
      }),
    };
  }

  // Trener je upravo potvrdio mejl: pretplata se pokrece na sajtu, ne u aplikaciji.
  // Salje okidac na auth.users (tg_trener_mejl_pretplata_na_sajtu). Bez cena u tekstu.
  if (event === "trainer_billing_intro") {
    return {
      subject: "Još jedan korak: pokreni pretplatu na sajtu",
      html: renderTemplate({
        previewText: "Pretplata se pokreće na sajtu, a aplikacija se otključa sama.",
        eyebrow: "Sledeći korak",
        heading: "Pretplata se pokreće na sajtu, ne u aplikaciji",
        bodyHtml: `${greet}tvoj nalog je potvrđen. Ostao je još jedan korak: pokreni pretplatu na našem sajtu. Prvih 30 dana je besplatno, a aplikacija se otključa sama čim završiš.`,
        rows: [],
        steps: [
          {
            title: "Otvori fitlink.rs/pretplata",
            titleHtml: `Otvori <a class="t-accent" href="${BILLING_URL}" style="color:#8a36e8; text-decoration:none;">fitlink.rs/pretplata</a>`,
            text: "Prijavi se istim mejlom i lozinkom kao u aplikaciji.",
          },
          { title: "Izaberi plan", text: "Mesečni ili godišnji. Mesečni kreće sa 30 dana besplatno." },
          { title: "Vrati se u aplikaciju", text: "Otključa se sama, za nekoliko sekundi." },
        ],
        ctaText: "Pokreni 30 dana besplatno",
        ctaUrl: BILLING_URL,
        ctaBlock: true,
        noteHtml: `U aplikaciji nema kupovine. Plan, kartice i fakture su uvek na <a class="t-accent" href="${BILLING_URL}" style="color:#8a36e8; text-decoration:none; font-weight:500;">fitlink.rs/pretplata</a>`,
        footer: "FitLink, aplikacija za trenere.",
      }),
    };
  }

  // Trener: FitLink pretplata (salje notify_membership_expiry).
  if (event === "fitlink_sub_expiring" || event === "fitlink_sub_expired") {
    const naziv = sub.probni ? "Probni period" : "FitLink pretplata";
    const doFmt = fmtDate(sub.access_until);
    const n = typeof sub.vezbaca === "number" ? sub.vezbaca : 0;
    const rows: Row[] = [];
    if (doFmt) rows.push({ label: event === "fitlink_sub_expired" ? "Datum isteka" : "Važi do", value: doFmt });
    if (n > 0) rows.push({ label: "Vežbači", value: vezbaca(n) });

    if (event === "fitlink_sub_expiring") {
      const dl = typeof daysLeft === "number" ? daysLeft : 3;
      const kad = dl <= 0 ? "danas" : dl === 1 ? "sutra" : `za ${dl} dana`;
      const posledica = n > 0
        ? `izmene u aplikaciji se zaključavaju, a ${esc(vezbaca(n))} ${gube(n) ? "gube" : "gubi"} pristup treninzima`
        : "izmene u aplikaciji se zaključavaju";
      return {
        subject: `${naziv} ističe ${kad}`,
        html: renderTemplate({
          previewText: `${naziv} ističe ${kad}.`,
          eyebrow: "Podsetnik",
          heading: `${naziv} ističe ${kad}`,
          bodyHtml: `${greet}tvoja pretplata važi do ${doFmt || "kraja perioda"}. Kad istekne, ${posledica}. Produži je na vreme i sve radi bez prekida.`,
          rows,
          ctaText: "Produži pretplatu",
          ctaUrl: BILLING_URL,
        }),
      };
    }

    const naslov = sub.probni ? "Probni period je istekao" : "FitLink pretplata je istekla";
    return {
      subject: naslov,
      html: renderTemplate({
        previewText: "Izmene su zaključane dok ne produžiš pretplatu.",
        eyebrow: "Pretplata",
        heading: naslov,
        bodyHtml: `${greet}izmene u aplikaciji su zaključane${n > 0 ? ", a tvoji vežbači ne mogu da treniraju" : ""} dok ne produžiš pretplatu. Čim je produžiš, sve se otključa samo od sebe.`,
        rows,
        ctaText: "Produži pretplatu",
        ctaUrl: BILLING_URL,
      }),
    };
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Zove je samo baza (pg_net) sa service_role kljucem; niko spolja ne sme da salje mejlove.
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
    if (!payload) return json({ error: "invalid json" }, 400);
    // athlete_id je id primaoca (vezbac ili, za pretplatu, trener).
    const { event, athlete_id, membership, days_left, subscription } = payload;
    if (!event || !athlete_id) return json({ error: "missing event or athlete_id" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: ures, error: uerr } = await admin.auth.admin.getUserById(athlete_id);
    if (uerr) return json({ error: "getUser failed", detail: uerr.message }, 500);
    const email = ures?.user?.email;
    if (!email) return json({ error: "athlete has no email" }, 404);

    const { data: prof } = await admin.from("profiles").select("full_name").eq("id", athlete_id).maybeSingle();
    const name = prof?.full_name ?? null;

    const built = buildEmail(event, name, membership ?? {}, days_left, subscription ?? {});
    if (!built) return json({ error: "unknown event" }, 400);

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: email, subject: built.subject, html: built.html }),
    });
    const text = await resp.text();
    if (!resp.ok) return json({ error: "resend failed", status: resp.status, body: text }, 502);

    let id: string | null = null;
    try { id = JSON.parse(text)?.id ?? null; } catch { /* ignore */ }
    return json({ ok: true, id, to: email, event });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
