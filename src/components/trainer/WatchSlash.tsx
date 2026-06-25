import { Watch } from "lucide-react";

// "Precrtan sat" - isto znacenje kao applewatch.slash na Live Activity kartici:
// lucide Watch + dijagonalna crta (donji-levi -> gornji-desni). Dim/neutralna boja
// (text-muted-foreground -> currentColor). Za vezbace BEZ sveseg watch HR signala,
// na mestu gde inace stoji puls. Bez broja, bez srca, bez boje zone.
export const WatchSlash = ({ size = 16 }: { size?: number }) => (
  <span
    className="relative inline-flex shrink-0 items-center justify-center text-muted-foreground"
    style={{ width: size, height: size }}
    role="img"
    aria-label="Bez sata"
  >
    <Watch size={size} strokeWidth={2} aria-hidden="true" />
    <svg
      viewBox="0 0 16 16"
      className="absolute inset-0 h-full w-full pointer-events-none"
      aria-hidden="true"
    >
      {/* Outline u boji kartice ispod glavne crte -> slash "secka" sat (kao SF Symbol). */}
      <line
        x1="2.5"
        y1="13.5"
        x2="13.5"
        y2="2.5"
        stroke="hsl(var(--surface))"
        strokeWidth="3.25"
        strokeLinecap="round"
      />
      {/* Glavna dijagonalna crta, ista dim boja kao ikona. */}
      <line
        x1="2.5"
        y1="13.5"
        x2="13.5"
        y2="2.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  </span>
);

export default WatchSlash;
