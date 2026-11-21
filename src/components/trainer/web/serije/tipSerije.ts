// Tip serije koji bira samo trener (u programu ili uzivo). Na serveru je kolona
// set_type, NULL je obicna serija. Slova, nazivi, boje i redosled su isti kao u
// nativnoj aplikaciji (FitLink/Design/TipSerije.swift).

export type TipSerijeId =
  | "warmup"
  | "failure"
  | "drop"
  | "left"
  | "right"
  | "negative"
  | "partial"
  | "myo"
  | "feeder"
  | "top"
  | "backoff";

export type TipSerije = { id: TipSerijeId; slovo: string; naziv: string; boja: string };

export const TIPOVI_SERIJE: TipSerije[] = [
  { id: "warmup", slovo: "W", naziv: "Zagrevanje", boja: "#FACC15" },
  { id: "failure", slovo: "F", naziv: "Do otkaza", boja: "#F04438" },
  { id: "drop", slovo: "D", naziv: "Drop set", boja: "#3B8BF6" },
  { id: "left", slovo: "L", naziv: "Leva strana", boja: "#3DCB6C" },
  { id: "right", slovo: "R", naziv: "Desna strana", boja: "#B065F0" },
  { id: "negative", slovo: "N", naziv: "Negativna ponavljanja", boja: "#FB8A1E" },
  { id: "partial", slovo: "P", naziv: "Delimična ponavljanja", boja: "#9BD62E" },
  { id: "myo", slovo: "M", naziv: "Myo-reps", boja: "#FF5A2C" },
  { id: "feeder", slovo: "FE", naziv: "Feeder", boja: "#FFB020" },
  { id: "top", slovo: "T", naziv: "Top set", boja: "#6F6BF2" },
  { id: "backoff", slovo: "B", naziv: "Back-off set", boja: "#19B8A6" },
];

export const NAZIV_OBICNE = "Obična serija";

/** Raspored na listi za izbor: prva tri preko cele sirine, ostali u parovima. */
export const SIROKI: TipSerijeId[] = ["warmup", "failure", "drop"];
export const PAROVI: [TipSerijeId, TipSerijeId][] = [
  ["left", "right"],
  ["negative", "partial"],
  ["myo", "feeder"],
  ["top", "backoff"],
];

/** Tip po vrednosti sa servera; nepoznata vrednost se prikazuje kao obicna serija. */
export const tipSerije = (s: string | null | undefined): TipSerije | null =>
  TIPOVI_SERIJE.find((t) => t.id === s) ?? null;

export const nazivTipa = (s: string | null | undefined): string => tipSerije(s)?.naziv ?? NAZIV_OBICNE;

/** 1 serija, 3 serije, 5 serija. */
export const serijaRec = (n: number): string => {
  const p = n % 10;
  const p2 = n % 100;
  if (p === 1 && p2 !== 11) return `${n} serija`;
  if (p >= 2 && p <= 4 && !(p2 >= 12 && p2 <= 14)) return `${n} serije`;
  return `${n} serija`;
};

/** Tekst za citac ekrana: "Serija 2, Drop set". */
export const opisSerije = (broj: number, s: string | null | undefined): string => {
  const t = tipSerije(s);
  return t ? `Serija ${broj}, ${t.naziv}` : `Serija ${broj}`;
};
