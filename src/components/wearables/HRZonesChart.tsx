import { ZONE_DEFS, formatMmSs } from "@/lib/wearable/hrZones";

interface ZoneRow {
  zone: number;
  zone_name?: string | null;
  seconds_in_zone: number;
  min_bpm?: number | null;
  max_bpm?: number | null;
}

interface Props {
  zones: ZoneRow[];
}

export const HRZonesChart = ({ zones }: Props) => {
  const total = zones.reduce((s, z) => s + (z.seconds_in_zone ?? 0), 0);

  // Mapiraj po broju zone, dopuni nule
  const byZone = new Map<number, ZoneRow>();
  zones.forEach((z) => byZone.set(z.zone, z));

  return (
    <div className="space-y-2.5">
      {ZONE_DEFS.map((def) => {
        const row = byZone.get(def.zone);
        const sec = row?.seconds_in_zone ?? 0;
        const pct = total > 0 ? Math.round((sec / total) * 100) : 0;
        return (
          <div key={def.zone} className="space-y-1">
            <div className="flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: def.color }}
                />
                <span className="font-semibold text-foreground">
                  Zona {def.zone}
                </span>
                <span className="text-muted-foreground truncate">
                  {def.name}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground tnum shrink-0">
                <span className="font-semibold text-foreground">
                  {formatMmSs(sec)}
                </span>
                <span>{pct}%</span>
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: def.color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
