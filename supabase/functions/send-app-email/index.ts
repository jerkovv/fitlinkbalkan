import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = "https://app.fitlink.rs";
const FROM = "FitLink <noreply@fitlink.rs>";

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

function renderTemplate(o: {
  previewText: string;
  eyebrow: string;
  heading: string;
  bodyHtml: string;
  rows: Row[];
  ctaText: string;
  ctaUrl: string;
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
  <a href="${o.ctaUrl}" style="display:inline-block; background-color:#8a36e8; background-image:linear-gradient(135deg,#8a36e8 0%,#603dea 55%,#e84bae 100%); color:#ffffff; font-family:'Inter Tight',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:15px; font-weight:600; text-decoration:none; padding:15px 32px; border-radius:12px; box-shadow:0 8px 22px -8px rgba(138,54,232,0.5);">${esc(o.ctaText)}</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="sr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FitLink</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
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
  }
</style>
</head>
<body class="email-bg" style="margin:0; padding:0; background-color:#ededf3; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${esc(o.previewText)}</div>

<table role="presentation" class="email-bg" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ededf3;">
<tr>
<td align="center" style="padding:40px 16px;">

<table role="presentation" class="email-card" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:600px; background-color:#ffffff; border-radius:20px; border:1px solid #e6e6ee; box-shadow:0 4px 28px rgba(22,22,38,0.07); overflow:hidden;">

<tr><td style="padding:44px 44px 38px 44px; font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <div class="t-primary" style="font-family:'Inter Tight',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:22px; font-weight:800; letter-spacing:-0.5px; color:#16161f;">Fit<span style="color:#8a36e8;">Link</span></div>

  <div style="height:22px; line-height:22px; font-size:0;">&nbsp;</div>
  <div class="hairline" style="border-top:1px solid #ececf2; font-size:0; line-height:0;">&nbsp;</div>
  <div style="height:30px; line-height:30px; font-size:0;">&nbsp;</div>

  <div style="font-size:12px; font-weight:600; letter-spacing:1.2px; text-transform:uppercase; color:#8a36e8;">${esc(o.eyebrow)}</div>
  <div style="height:8px; line-height:8px; font-size:0;">&nbsp;</div>
  <div class="t-primary" style="font-family:'Inter Tight',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:25px; font-weight:700; letter-spacing:-0.4px; color:#16161f; line-height:1.25;">${esc(o.heading)}</div>

  <div style="height:14px; line-height:14px; font-size:0;">&nbsp;</div>
  <div class="t-body" style="font-size:15px; color:#4b4b57; line-height:1.7;">${o.bodyHtml}</div>
${rowsHtml}
${ctaHtml}

</td></tr>

<tr><td class="hairline" style="padding:24px 44px 30px 44px; border-top:1px solid #eeeef4; font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div class="t-muted" style="font-size:13px; color:#8c8c99; line-height:1.6;">FitLink, tvoj trening na jednom mestu.</div>
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
  daysLeft?: number
): { subject: string; html: string } | null {
  const greet = name ? `Zdravo ${esc(name)}, ` : "Zdravo, ";
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

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const payload = await req.json().catch(() => null);
    if (!payload) return json({ error: "invalid json" }, 400);
    const { event, athlete_id, membership, days_left } = payload;
    if (!event || !athlete_id) return json({ error: "missing event or athlete_id" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: ures, error: uerr } = await admin.auth.admin.getUserById(athlete_id);
    if (uerr) return json({ error: "getUser failed", detail: uerr.message }, 500);
    const email = ures?.user?.email;
    if (!email) return json({ error: "athlete has no email" }, 404);

    const { data: prof } = await admin.from("profiles").select("full_name").eq("id", athlete_id).maybeSingle();
    const name = prof?.full_name ?? null;

    const built = buildEmail(event, name, membership ?? {}, days_left);
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
