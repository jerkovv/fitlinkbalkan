import { supabase } from "@/lib/supabase";

// Zajednicko za "Placanja po mesecima" (Uplate) i spisak clanarina na stranici
// vezbaca. Placeno se cuva kroz trainer_set_membership_paid: clanarina sa
// zahtevom menja paid_at na zahtevu, a rucno unetoj se tada napravi zapis o
// uplati, pa zarada (paid_at) uvek prati ono sto je trener stiklirao.

export type ClanarinaRed = {
  id: string;
  athlete_id: string;
  plan_name: string | null;
  price: number | null;
  status: string | null;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
  purchase_id: string | null;
  membership_purchases: { paid_at: string | null } | null;
};

export const CLANARINA_POLJA =
  "id, athlete_id, plan_name, price, status, starts_on, ends_on, created_at, purchase_id, membership_purchases(paid_at)";

export const MESECI_KRATKO = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "avg", "sep", "okt", "nov", "dec"];
const MESECI_PUNO = [
  "januar", "februar", "mart", "april", "maj", "jun",
  "jul", "avgust", "septembar", "oktobar", "novembar", "decembar",
];

// Kljuc meseca "2026-11". starts_on je datum bez vremena, pa se cita kao tekst
// (new Date bi ga pomerio po zoni); bez datuma vazi kad je clanarina uneta.
export const mesecClanarine = (c: ClanarinaRed) => {
  if (c.starts_on) return c.starts_on.slice(0, 7);
  const d = new Date(c.created_at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const kljucMeseca = (godina: number, mesec0: number) => {
  const d = new Date(godina, mesec0, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const nazivMeseca = (kljuc: string, kratko = true) => {
  const [g, m] = kljuc.split("-").map(Number);
  return `${(kratko ? MESECI_KRATKO : MESECI_PUNO)[m - 1]} ${g}`;
};

export const danMeseca = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}. ${MESECI_KRATKO[m - 1]}`;
};

export const rsd = (n: number) => `${Math.round(n).toLocaleString("sr-Latn-RS")} RSD`;

export const jePlacena = (c: ClanarinaRed) => !!c.membership_purchases?.paid_at;

/** Upisuje placeno/nije placeno i vraca red sa novim stanjem. */
export const postaviPlaceno = async (c: ClanarinaRed, placeno: boolean) => {
  const { data, error } = await supabase.rpc("trainer_set_membership_paid", {
    p_membership_id: c.id,
    p_paid: placeno,
  });
  if (error) return { error, red: c };
  const res = data as { purchase_id?: string; paid_at?: string | null } | null;
  const red: ClanarinaRed = {
    ...c,
    purchase_id: res?.purchase_id ?? c.purchase_id,
    membership_purchases: { paid_at: res?.paid_at ?? null },
  };
  return { error: null, red };
};
