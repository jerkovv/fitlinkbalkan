import { useMemo } from "react";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";
import { ZONE_DEFS, zoneForBpm, type HRSample } from "@/lib/wearable/hrZones";

interface Props {
  hrSeries: HRSample[];
  maxHR: number;
  hrAvg?: number | null;
  hrMax?: number | null;
}

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

export const HRTimeSeriesChart = ({ hrSeries, maxHR, hrAvg, hrMax }: Props) => {
  const data = useMemo(() => {
    if (!hrSeries?.length) return [];
    // Downsample za vizuelnu jasnoću (target ~80 bara)
    const target = 80;
    const step = Math.max(1, Math.floor(hrSeries.length / target));
    const out: Array<{ ts: string; bpm: number; color: string }> = [];
    for (let i = 0; i < hrSeries.length; i += step) {
      const slice = hrSeries.slice(i, i + step);
      const avg = slice.reduce((a, b) => a + b.bpm, 0) / slice.length;
      const z = zoneForBpm(avg, maxHR);
      out.push({
        ts: slice[0].ts,
        bpm: Math.round(avg),
        color: z?.color ?? ZONE_DEFS[0].color,
      });
    }
    return out;
  }, [hrSeries, maxHR]);

  if (!data.length) {
    return (
      <div className="h-[160px] flex items-center justify-center text-[12px] text-muted-foreground">
        Nema podataka o pulsu
      </div>
    );
  }

  return (
    <div className="relative">
      {hrMax != null && (
        <div className="absolute right-1 top-0 z-10 text-right">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
            Maks
          </div>
          <div className="font-display text-[18px] font-bold tracking-tightest leading-none">
            {hrMax}
            <span className="text-[11px] text-muted-foreground font-medium ml-1">
              bpm
            </span>
          </div>
        </div>
      )}
      <div className="h-[180px] -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="ts"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={fmtTime}
              axisLine={false}
              tickLine={false}
              minTickGap={32}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={28}
              domain={["dataMin - 10", "dataMax + 10"]}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
              contentStyle={{
                background: "hsl(var(--surface))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => fmtTime(v as string)}
              formatter={(v: any) => [`${v} bpm`, "Puls"]}
            />
            {hrAvg != null && (
              <ReferenceLine
                y={hrAvg}
                stroke="hsl(var(--foreground) / 0.6)"
                strokeDasharray="3 3"
                label={{
                  value: `prosek ${hrAvg}`,
                  position: "right",
                  fontSize: 9,
                  fill: "hsl(var(--muted-foreground))",
                }}
              />
            )}
            <Bar dataKey="bpm" radius={[2, 2, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
