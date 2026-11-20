// podrska-push: kad FitLink tim odgovori u Luno cetu "Podrska", korisniku FitLink aplikacije stize push.
//
// Poziva ga iskljucivo Luno baza (okidac na messages, sajt fitlink-app) preko pg_net, sa zaglavljem
// x-podrska-kljuc koje mora da se poklopi sa tajnom PODRSKA_PUSH_KLJUC (ista vrednost je u Luno Vault-u).
// Telo: { fitlink_id: uuid, poruka: string }. Funkcija salje send-push: naslov "FitLink podrska",
// tekst je pocetak odgovora, kind "podrska_odgovor" (aplikacija na dodir otvara cet).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KLJUC = Deno.env.get("PODRSKA_PUSH_KLJUC") ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

// Poredjenje bez curenja duzine i vremena.
function isti(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let r = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) r |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return r === 0;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ error: "method" }, 405);
    const dato = (req.headers.get("x-podrska-kljuc") ?? "").trim();
    if (KLJUC.length < 32 || !isti(dato, KLJUC)) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const userId = String(body?.fitlink_id ?? "").trim();
    if (!UUID.test(userId)) return json({ error: "fitlink_id" }, 400);
    const cist = String(body?.poruka ?? "").replace(/\s+/g, " ").trim();
    const tekst = cist.length > 140 ? cist.slice(0, 137) + "..." : cist || "Stigao je odgovor.";

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({
        user_id: userId,
        title: "FitLink podrška",
        body: tekst,
        kind: "podrska_odgovor",
        meta: { izvor: "podrska" },
      }),
    });
    const odgovor = await resp.text();
    if (!resp.ok) return json({ error: "send-push", status: resp.status, body: odgovor.slice(0, 300) }, 502);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
