// Centralni prevodilac gresaka u prijateljske srpske poruke. Cilj: korisnik NIKAD
// ne sme da vidi sirov Postgres/mrezni tekst (npr. "violates check constraint
// athletes_birth_year_chk") - uvek dobija prevedenu poruku, dok se original loguje
// u konzolu radi debagovanja.

type ErrorLike = {
  code?: string | number;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
} | null | undefined;

function toErrorLike(error: unknown): ErrorLike {
  if (error && typeof error === "object") return error as ErrorLike;
  if (typeof error === "string") return { message: error };
  return null;
}

// Poznata ogranicenja (CHECK/UNIQUE constraint imena) -> konkretna, korisna poruka.
// Poredi se po podnizu u message/details, pa je otporno na puno ime constraint-a
// koje Postgres ume da doda (npr. sa nazivom seme).
const KNOWN_CONSTRAINTS: { match: string; message: string }[] = [
  { match: "athletes_birth_year_chk", message: "Godina rođenja mora biti između 1900 i ove godine." },
  { match: "athletes_gender_chk", message: "Izaberi pol iz ponuđene liste." },
  { match: "trainers_years_chk", message: "Godine iskustva moraju biti između 0 i 80." },
  { match: "trainers_slug_format", message: "Adresa javne stranice sme da sadrži samo mala slova, brojeve i crticu." },
  { match: "trainers_cancel_cutoff_hours_check", message: "Rok za otkazivanje mora biti između 0 i 168 sati." },
  { match: "membership_packages_duration_days_check", message: "Trajanje paketa mora biti između 1 i 365 dana." },
  { match: "membership_packages_sessions_count_check", message: "Broj treninga mora biti između 1 i 200." },
  { match: "membership_packages_price_rsd_check", message: "Cena ne može biti negativna." },
  { match: "messages_body_check", message: "Poruka ne može biti prazna ni duža od 4000 znakova." },
  { match: "food_items_grams_per_unit_check", message: "Gramaža po jedinici mora biti veća od nule." },
  // Preneto iz stare src/lib/dbError.ts (sad ukinut fajl) da se ne izgubi postojeca poruka.
  { match: "session_slot_templates", message: "Već imaš termin u to vreme za taj tip sesije." },
];

// Postgres/PostgREST kodovi -> generican prevod, kad ime ogranicenja nije poznato.
const CODE_MESSAGES: Record<string, string> = {
  "23514": "Uneta vrednost nije u dozvoljenom opsegu.",
  "23505": "Taj unos već postoji.",
  "23503": "Povezani podatak ne postoji ili je u međuvremenu obrisan.",
  "23502": "Nedostaje obavezno polje.",
  "22P02": "Uneta vrednost nije ispravan broj.",
  "22003": "Broj je prevelik.",
};

// Kad poruka NEMA .code, moze biti rucno napisana poruka IZ APP-E (npr. "Niste prijavljeni")
// koju zelimo da prosledimo doslovno - ali moze biti i BILO KOJA druga runtime greska bez
// .code (slomljen JSON.parse, TypeError iz JS-a, mrezna greska koju network-check iznad nije
// uhvatio, greska iz Capacitor plugina...), a to je i dalje tehnicki tekst koji korisnik ne
// sme da vidi. Ovaj filter je "belo dugme": pass-through prolazi SAMO ako poruka ne lici ni na
// jedan poznat tehnicki obrazac. NE brisati kao "suvisno" - bez njega runtime greske ponovo
// cure ka korisniku isto kao sirove Postgres greske pre ovog fajla.
const TECHNICAL_PATTERNS = [
  "failed to fetch", "networkerror", "load failed", "aborterror", "abort",
  "unexpected token", "json", "syntaxerror", "typeerror", "referenceerror",
  "is not a function", "is not defined", "undefined", "null is not",
  "timeout", "timed out", "econnrefused", "err_",
  "violates", "constraint", 'relation "', 'column "', "duplicate key",
  "permission denied", "jwt", "pgrst", "supabase",
  "plugin", "not implemented", "capacitor",
];

const looksTechnical = (text: string): boolean => {
  const lower = text.toLowerCase();
  return TECHNICAL_PATTERNS.some((p) => lower.includes(p));
};

export function porukaGreske(error: unknown): string {
  // Original uvek ide u konzolu - korisnik dobija samo prevod, debug trag se ne gubi.
  console.error(error);

  const e = toErrorLike(error);
  const haystack = `${e?.message ?? ""} ${e?.details ?? ""} ${e?.hint ?? ""}`;
  const code = e?.code != null ? String(e.code) : null;
  const status = e?.status;

  for (const known of KNOWN_CONSTRAINTS) {
    if (haystack.includes(known.match)) return known.message;
  }

  if (code === "PGRST301" || code === "401" || status === 401) {
    return "Sesija je istekla. Prijavi se ponovo.";
  }

  if (code === "42501") {
    return "Nemaš dozvolu za ovu radnju.";
  }

  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];

  const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (
    isOffline ||
    haystack.includes("Failed to fetch") ||
    haystack.includes("NetworkError") ||
    haystack.includes("Load failed")
  ) {
    return "Nema internet konekcije. Proveri mrežu pa pokušaj ponovo.";
  }

  // Postgres/PostgREST greske UVEK nose code (ili status) - ako ga nema, ovo nije sirova
  // greska iz baze nego vec rucno napisana poruka u samoj app-i (npr. "throw new Error(...)"
  // sa smislenim tekstom, kao "Niste prijavljeni"). Takve prosledjujemo kao sto jesu, umesto
  // da ih pregazimo genericnim fallback-om - fallback je rezervisan za NEPOZNATE baza/API greske.
  const hasApiShape = e != null && typeof e === "object" && ("code" in e || "status" in e);
  if (!hasApiShape && e?.message && !looksTechnical(e.message)) {
    return e.message;
  }

  return "Nešto nije u redu. Pokušaj ponovo.";
}
