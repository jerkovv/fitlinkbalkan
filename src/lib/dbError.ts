// Centralni prevod Postgres/Supabase gresaka u prijateljske srpske poruke.
//
// Koristi se svuda gde se korisniku prikazuje greska (toast.error), da se
// sirove baza-poruke (npr "duplicate key value violates unique constraint
// session_slot_templates_...") ne vide na ekranu.

type DbErrorLike = {
  code?: string;
  message?: string;
  details?: string;
} | null | undefined;

// Mapiranje unique constraint -> prijateljska poruka. Trazi se podniz u
// message/details, pa je otporno na puno ime constraint-a.
const UNIQUE_MESSAGES: { match: string; message: string }[] = [
  { match: "session_slot_templates", message: "Vec imas termin u to vreme za taj tip sesije." },
];

export function friendlyDbError(error: DbErrorLike): string {
  if (!error) return "Doslo je do greske.";

  const haystack = `${error.message ?? ""} ${error.details ?? ""}`;

  // 23505 = unique_violation
  if (error.code === "23505") {
    const hit = UNIQUE_MESSAGES.find((u) => haystack.includes(u.match));
    if (hit) return hit.message;
    return "Ovaj unos vec postoji.";
  }

  return error.message || "Doslo je do greske.";
}
