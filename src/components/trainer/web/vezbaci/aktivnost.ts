// Ista pravila kao u nativnoj aplikaciji (TrenerVezbaciView.swift): ko trenira
// redovno, ko je usporio, ko je nestao i u kom je stanju clanarina.

export type Ritam = "redovno" | "usporilo" | "nestalo";
export type StanjeClanarine = "Aktivan" | "Uskoro" | "Istekla" | "Bez članarine";
export type FilterVezbaca = "all" | "active" | "expiring" | "expired";

export type Vezbac = {
  id: string;
  ime: string;
  avatarUrl: string | null;
  cilj: string | null;
  paket: string | null;
  clanarinaDo: string | null;
  imaClanarinu: boolean;
  aktivna: boolean;
  poslednjiTrening: string | null;
  /** Kalendarski dani sa servera (days_since_last), za tekst. */
  danaOdTreninga: number | null;
};

const DAN_MS = 24 * 60 * 60 * 1000;

/** Puni dani od poslednjeg treninga; ko nikad nije trenirao ima 999, kao na telefonu. */
export const danaBezTreninga = (v: Vezbac, sada = Date.now()): number => {
  if (!v.poslednjiTrening) return 999;
  return Math.floor((sada - new Date(v.poslednjiTrening).getTime()) / DAN_MS);
};

export const ritamVezbaca = (v: Vezbac): Ritam => {
  const dana = danaBezTreninga(v);
  if (dana <= 14) return "redovno";
  return dana <= 45 ? "usporilo" : "nestalo";
};

export const RITMOVI: { kljuc: Ritam; naziv: string; raspon: string; boja: string }[] = [
  { kljuc: "redovno", naziv: "redovno", raspon: "do 14 dana", boja: "hsl(var(--success))" },
  { kljuc: "usporilo", naziv: "usporilo", raspon: "15-45 dana", boja: "hsl(var(--warning))" },
  { kljuc: "nestalo", naziv: "nestalo", raspon: "45+ dana", boja: "hsl(var(--destructive))" },
];

/** Prvo oni koji su najduze odsutni. */
export const usporiliRedom = (svi: Vezbac[]): Vezbac[] =>
  svi
    .filter((v) => ritamVezbaca(v) === "usporilo")
    .sort((a, b) => danaBezTreninga(b) - danaBezTreninga(a));

/** Ko je nekad trenirao ide ispred onih koji jos nisu poceli. */
export const nestaliRedom = (svi: Vezbac[]): Vezbac[] => {
  const nestali = svi.filter((v) => ritamVezbaca(v) === "nestalo");
  return [
    ...nestali
      .filter((v) => v.poslednjiTrening != null)
      .sort((a, b) => danaBezTreninga(a) - danaBezTreninga(b)),
    ...nestali.filter((v) => v.poslednjiTrening == null),
  ];
};

/** Lica i imena na kartici. Nov vezbac koji jos nije poceo sam ne pali podsetnik. */
export const zaPodsetnik = (svi: Vezbac[]): Vezbac[] => {
  const usporili = usporiliRedom(svi);
  return usporili.length > 0
    ? usporili
    : nestaliRedom(svi).filter((v) => v.poslednjiTrening != null);
};

export const prvoIme = (ime: string): string => ime.split(/\s+/).filter(Boolean)[0] ?? ime;

export const imenaPodsetnika = (lista: Vezbac[]): string => {
  const imena = lista.slice(0, 2).map((v) => prvoIme(v.ime));
  const ostalo = lista.length - imena.length;
  return ostalo > 0 ? `${imena.join(", ")} i još ${ostalo}` : imena.join(" i ");
};

const pocetakDana = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** "2026-11-21" kao lokalna ponoc; new Date(s) bi ga citao kao UTC. */
export const danIzTeksta = (s: string): Date => {
  const [g, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(g, m - 1, d);
};

export const kadJeTrenirao = (v: Vezbac): string => {
  if (!v.poslednjiTrening) return "Još nije trenirao";
  const dan = pocetakDana(new Date(v.poslednjiTrening)).getTime();
  const danas = pocetakDana(new Date());
  if (dan === danas.getTime()) return "Trenirao danas";
  const juce = new Date(danas.getFullYear(), danas.getMonth(), danas.getDate() - 1);
  if (dan === juce.getTime()) return "Trenirao juče";
  return `Pre ${v.danaOdTreninga ?? danaBezTreninga(v)} dana`;
};

export const stanjeClanarine = (v: Vezbac): StanjeClanarine => {
  if (!v.imaClanarinu) return "Bez članarine";
  if (!v.aktivna) return "Istekla";
  if (!v.clanarinaDo) return "Aktivan";
  const dana = Math.round(
    (danIzTeksta(v.clanarinaDo).getTime() - pocetakDana(new Date()).getTime()) / DAN_MS,
  );
  if (dana < 0) return "Istekla";
  return dana <= 7 ? "Uskoro" : "Aktivan";
};

export const uFilteru = (v: Vezbac, f: FilterVezbaca): boolean => {
  const s = stanjeClanarine(v);
  if (f === "active") return s === "Aktivan";
  if (f === "expiring") return s === "Uskoro";
  if (f === "expired") return s === "Istekla" || s === "Bez članarine";
  return true;
};

export const filterIzAdrese = (vrednost: string | null): FilterVezbaca => {
  if (vrednost === "aktivni") return "active";
  if (vrednost === "uskoro") return "expiring";
  if (vrednost === "istekli") return "expired";
  return "all";
};

/** Naziv cilja kao na profilu i spisku na telefonu; bez cilja nema oznake. */
export const ciljNaziv = (g: string | null | undefined): string | null => {
  switch (g) {
    case "lose_weight": return "Mršavljenje";
    case "gain_muscle": return "Mišićna masa";
    case "endurance": return "Izdržljivost";
    case "mobility": return "Mobilnost";
    case "general": return "Opšta forma";
    default: return null;
  }
};

const MESECI = [
  "Januar", "Februar", "Mart", "April", "Maj", "Jun",
  "Jul", "Avgust", "Septembar", "Oktobar", "Novembar", "Decembar",
];

/** Prosli mesec po beogradskom vremenu, kao na kartici "u brojkama". */
export const prosliMesec = (sada = new Date()): string => {
  const broj = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Belgrade", month: "numeric" }).format(sada),
  );
  return MESECI[(broj + 10) % 12];
};

/** Jedna decimala, zarez, bez nule na kraju. */
export const brojTekst = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",");
};

/** Broj iz polja: prima i zarez i tacku; prazno ili neispravno je null. */
export const brojIzTeksta = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (!t || !/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
};
