/**
 * Heart-rate zones helpers.
 * Boje su definisane direktno (zonske boje su semantički univerzalne i ne menjaju se sa temom).
 */

export interface ZoneDef {
  zone: 1 | 2 | 3 | 4 | 5;
  name: string;
  minPct: number;
  maxPct: number;
  color: string;
}

export const ZONE_DEFS: ZoneDef[] = [
  { zone: 1, name: "Lagano",      minPct: 0.50, maxPct: 0.60, color: "hsl(195 70% 60%)" },
  { zone: 2, name: "Aerobno",     minPct: 0.60, maxPct: 0.70, color: "hsl(150 60% 50%)" },
  { zone: 3, name: "Tempo",       minPct: 0.70, maxPct: 0.80, color: "hsl(45 90% 55%)"  },
  { zone: 4, name: "Anaerobno",   minPct: 0.80, maxPct: 0.90, color: "hsl(20 85% 55%)"  },
  { zone: 5, name: "Maksimalno",  minPct: 0.90, maxPct: 1.00, color: "hsl(0 80% 55%)"   },
];

export function computeMaxHR(birthYear: number | null | undefined): number {
  if (!birthYear || birthYear < 1900) return 180;
  const age = new Date().getFullYear() - birthYear;
  if (age < 5 || age > 120) return 180;
  return 220 - age;
}

export interface HRSample { ts: string; bpm: number; }

export interface ZoneBucket {
  zone: 1 | 2 | 3 | 4 | 5;
  zone_name: string;
  min_bpm: number;
  max_bpm: number;
  seconds_in_zone: number;
}

/**
 * Pronađi zonu (1-5) za dati bpm; null ako je ispod zone 1.
 */
export function zoneForBpm(bpm: number, maxHR: number): ZoneDef | null {
  const pct = bpm / maxHR;
  // Zone 5 je inkluzivna gornja granica
  for (const z of ZONE_DEFS) {
    if (pct >= z.minPct && (pct < z.maxPct || z.zone === 5)) return z;
  }
  return null;
}

/**
 * Iterira hr_series, sumira sekunde po zoni.
 * Koristi razmak između susednih semplova kao trajanje.
 */
export function computeZones(hrSeries: HRSample[], maxHR: number): ZoneBucket[] {
  const buckets: Record<number, ZoneBucket> = {};
  ZONE_DEFS.forEach((z) => {
    buckets[z.zone] = {
      zone: z.zone,
      zone_name: z.name,
      min_bpm: Math.round(maxHR * z.minPct),
      max_bpm: Math.round(maxHR * z.maxPct),
      seconds_in_zone: 0,
    };
  });

  if (!hrSeries || hrSeries.length === 0) return Object.values(buckets);

  const sorted = [...hrSeries]
    .filter((s) => Number.isFinite(s.bpm) && s.bpm > 0 && s.ts)
    .sort((a, b) => (a.ts < b.ts ? -1 : 1));

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    let dt = 5; // default 5s ako nema sledećeg sempla
    if (next) {
      const diff = (new Date(next.ts).getTime() - new Date(cur.ts).getTime()) / 1000;
      if (Number.isFinite(diff) && diff > 0 && diff < 120) dt = diff;
    }
    const z = zoneForBpm(cur.bpm, maxHR);
    if (z) buckets[z.zone].seconds_in_zone += dt;
  }

  Object.values(buckets).forEach((b) => {
    b.seconds_in_zone = Math.round(b.seconds_in_zone);
  });

  return Object.values(buckets).sort((a, b) => a.zone - b.zone);
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "0min";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min`;
  return `${seconds}s`;
}

export function formatMmSs(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
