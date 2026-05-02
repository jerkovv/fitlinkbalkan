// HR zone color helper for live workout views.
// Colors are intentionally hardcoded HSL per design spec for HR zones.

export type HrZone = "rest" | "easy" | "moderate" | "hard" | "max";

export const HR_ZONE_COLOR: Record<HrZone, string> = {
  rest: "hsl(220 12% 60%)",
  easy: "hsl(195 70% 60%)",
  moderate: "hsl(150 60% 50%)",
  hard: "hsl(45 90% 55%)",
  max: "hsl(0 80% 55%)",
};

export const getHrZone = (bpm: number | null | undefined): HrZone => {
  if (bpm == null || !Number.isFinite(bpm) || bpm <= 0) return "rest";
  if (bpm < 110) return "easy";
  if (bpm < 140) return "moderate";
  if (bpm < 165) return "hard";
  return "max";
};

export const getHrColor = (bpm: number | null | undefined) => HR_ZONE_COLOR[getHrZone(bpm)];

export const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min`;
  return `${s}s`;
};
