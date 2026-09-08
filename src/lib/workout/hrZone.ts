// HR zone color helper for live workout views.
// Colors are intentionally hardcoded HSL per design spec for HR zones.

export type HrZone = "rest" | "easy" | "moderate" | "hard" | "max";

// Apple sistemske boje (systemGray/Blue/Green/Orange/Red), iste rampe kao zone
// na satu. Ovde stoje kao literali, ne kao CSS promenljive: deo prikaza zavrsava
// u SVG atributima (recharts Cell fill), gde var() ne moze da se razresi.
export const HR_ZONE_COLOR: Record<HrZone, string> = {
  rest: "hsl(240 6% 57%)",       /* systemGray  #8E8E93 */
  easy: "hsl(211 100% 50%)",     /* systemBlue  #007AFF */
  moderate: "hsl(135 59% 49%)",  /* systemGreen #34C759 */
  hard: "hsl(35 100% 50%)",      /* systemOrange #FF9500 */
  max: "hsl(4 100% 59%)",        /* systemRed   #FF3B30 */
};

export const getHrZone = (bpm: number | null | undefined): HrZone => {
  if (bpm == null || !Number.isFinite(bpm) || bpm <= 0) return "rest";
  if (bpm < 110) return "easy";
  if (bpm < 140) return "moderate";
  if (bpm < 165) return "hard";
  return "max";
};

export const getHrColor = (bpm: number | null | undefined) => HR_ZONE_COLOR[getHrZone(bpm)];

// Serverska zona 1-5 -> CSS token. Rampa je Apple-ova (plava, zelena, zuta,
// narandzasta, crvena), a ne brend rampa: vezbac istu skalu vidi na satu, pa bi
// violet za "lagano" znacio jedno na satu a drugo ovde. Tokeni imaju i tamnu
// varijantu (vidi index.css).
export const HR_ZONE_VAR: Record<number, string> = {
  1: "--hr-zone-1",
  2: "--hr-zone-2",
  3: "--hr-zone-3",
  4: "--hr-zone-4",
  5: "--hr-zone-5",
};

// Vraca naziv CSS varijable za datu zonu (1-5) ili null ako zona nije validna.
// Koristi se kao hsl(var(<token>)) i hsl(var(<token>) / alpha) za soft pozadinu.
export const getZoneVar = (zone: number | null | undefined): string | null => {
  if (zone == null) return null;
  return HR_ZONE_VAR[zone] ?? null;
};

export const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min`;
  return `${s}s`;
};
