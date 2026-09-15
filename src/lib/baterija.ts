// Ispod ovog procenta baterija trake ili sata se oznacava i upozorava.
export const NISKA_BATERIJA = 20;

/**
 * Procenat baterije samo ako je izmeren u ovom treningu. Zivo stanje cuva i
 * vrednost sa proslog treninga, koja bi inace izgledala kao trenutna.
 */
export const baterijaSesije = (
  pct: number | null | undefined,
  at: string | null | undefined,
  startedAt: string | null | undefined,
): number | null => {
  if (pct == null || !at || !startedAt) return null;
  return new Date(at).getTime() >= new Date(startedAt).getTime() ? pct : null;
};
