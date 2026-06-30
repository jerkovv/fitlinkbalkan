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
import {
  ZONE_DEFS, zoneForBpm, type HRSample, type HRPair,
} from "@/lib/wearable/hrZones";
import { formatHMS } from "@/lib/time";

interface Props {
  // Dva formata:
  //  - HRPair[]   [[t, hr], ...]  t = sekunde od pocetka treninga (in-app rezime)
  //  - HRSample[] [{ts, bpm}, ...] ts = ISO vreme (wearables/HealthKit)
  hrSeries: HRSample[] | HRPair[] | null | undefined;
  maxHR: number;
  hrAvg?: number | null;
  hrMax?: number | null;
}

const fmtClock = (ms: number) => {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

export const HRTimeSeriesChart = ({ hrSeries, maxHR, hrAvg, hrMax }: Props) => {
  const { data, fmtX } = useMemo(() => {
    const arr = (hrSeries ?? []) as Array<HRPair | HRSample>;
    if (!arr.length) return { data: [] as Array<{ x: number; bpm: number; color: string }>, fmtX: (v: any) => `${v}` };

    // Par [t, hr] (niz) -> elapsed sekunde; objekat {ts, bpm} -> clock vreme.
    const isPairs = Array.isArray(arr[0]);

    // Normalizuj na { x:number, bpm:number }. x = sekunde od pocetka (pairs) ili epoch ms (clock).
    const norm: Array<{ x: number; bpm: number }> = isPairs
      ? (arr as HRPair[])
          .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] > 0)
          .map((p) => ({ x: p[0], bpm: Math.round(p[1]) }))
      : (arr as HRSample[])
          .filter((s) => s && Number.isFinite(s.bpm) && s.bpm > 0 && !!s.ts)
          .map((s) => ({ x: new Date(s.ts).getTime(), bpm: Math.round(s.bpm) }))
          .filter((s) => Number.isFinite(s.x));

    norm.sort((a, b) => a.x - b.x);

    // Downsample za vizuelnu jasnocu (~80 bara). Boja po zoni proseka u isecku.
    const target = 80;
    const step = Math.max(1, Math.floor(norm.length / target));
    const out: Array<{ x: number; bpm: number; color: string }> = [];
    for (let i = 0; i < norm.length; i += step) {
      const slice = norm.slice(i, i + step);
      const avg = slice.reduce((a, b) => a + b.bpm, 0) / slice.length;
      const z = zoneForBpm(avg, maxHR);
      out.push({ x: slice[0].x, bpm: Math.round(avg), color: z?.color ?? ZONE_DEFS[0].color });
    }

    // X osa: elapsed -> mm:ss (8 -> "0:08", 90 -> "1:30"); clock -> HH:MM.
    const fmtX = isPairs ? (v: any) => formatHMS(Number(v)) : (v: any) => fmtClock(Number(v));

    return { data: out, fmtX };
  }, [hrSeries, maxHR]);

  // Manje od 2 validna uzorka -> sakrij ceo grafik (bez prazne ose / NaN).
  if (data.length < 2) return null;

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
              dataKey="x"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={fmtX}
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
              labelFormatter={(v) => fmtX(v)}
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
