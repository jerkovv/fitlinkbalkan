// Ispod ovog procenta baterija trake ili sata se oznacava i upozorava.
export const NISKA_BATERIJA = 20;

/**
 * Procenat baterije samo ako je izmeren u ovom treningu. Zivo stanje cuva i
 * vrednost sa proslog treninga, koja bi inace izgledala kao trenutna.
 */
/**
 * Jedna baterija za spisak aktivnih: traka ima prednost (kad je povezana, ona daje
 * puls), inace sat.
 */
export const baterijaZaPrikaz = (
  traka: number | null,
  sat: number | null,
): { pct: number; uredjaj: "traka" | "sat" } | null =>
  traka != null ? { pct: traka, uredjaj: "traka" } : sat != null ? { pct: sat, uredjaj: "sat" } : null;

export const baterijaSesije = (
  pct: number | null | undefined,
  at: string | null | undefined,
  startedAt: string | null | undefined,
): number | null => {
  if (pct == null || !at || !startedAt) return null;
  return new Date(at).getTime() >= new Date(startedAt).getTime() ? pct : null;
};
