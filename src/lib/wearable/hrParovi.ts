import type { HRPair, HRSample } from "@/lib/wearable/hrZones";

/**
 * Parovi [sekunde od pocetka, bpm] (get_inapp_workout_detail) -> {ts, bpm}. Grafik
 * pulsa tada ispod pise vreme na satu (09:14, 09:46...), isto kao trening sa sata,
 * umesto proteklog vremena.
 */
export const paroviUUzorke = (
  pairs: HRPair[] | null | undefined,
  startedAt: string | null | undefined,
): HRSample[] => {
  const start = startedAt ? new Date(startedAt).getTime() : NaN;
  if (!Number.isFinite(start)) return [];
  return (pairs ?? [])
    .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] > 0)
    .map((p) => ({ ts: new Date(start + p[0] * 1000).toISOString(), bpm: p[1] }));
};
