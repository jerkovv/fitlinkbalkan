import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui-bits";
import { Skeleton } from "@/components/ui/skeleton";
import { dataTypeLabel } from "@/lib/wearable/providers";

interface Props {
  userId?: string;
  dataType: string;
  days?: number;
  title?: string;
}

interface Row {
  recorded_for: string;
  value: number;
}

export const WearableTrendChart = ({
  userId,
  dataType,
  days = 30,
  title,
}: Props) => {
  const { user } = useAuth();
  const targetId = userId ?? user?.id ?? null;
  const meta = dataTypeLabel[dataType];
  const heading = title ?? `${meta?.label ?? dataType}, poslednjih ${days} dana`;

  const { data, isLoading } = useQuery({
    queryKey: ["wearable_trend", targetId, dataType, days],
    enabled: !!targetId,
    queryFn: async (): Promise<Row[]> => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("wearable_data" as any)
        .select("recorded_for, value")
        .eq("user_id", targetId!)
        .eq("data_type", dataType)
        .gte("recorded_for", sinceStr)
        .order("recorded_for", { ascending: true });
      if (error) throw error;

      // Agregat po danu (prosek ako ima više vrednosti)
      const map = new Map<string, { sum: number; n: number }>();
      ((data ?? []) as Row[]).forEach((r) => {
        const cur = map.get(r.recorded_for) ?? { sum: 0, n: 0 };
        cur.sum += Number(r.value);
        cur.n += 1;
        map.set(r.recorded_for, cur);
      });
      return Array.from(map.entries())
        .map(([recorded_for, v]) => ({ recorded_for, value: v.sum / v.n }))
        .sort((a, b) => (a.recorded_for < b.recorded_for ? -1 : 1));
    },
  });

  return (
    <Card className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
        {heading}
      </div>

      {isLoading ? (
        <Skeleton className="h-[140px] w-full" />
      ) : !data || data.length === 0 ? (
        <div className="h-[140px] flex items-center justify-center text-[12px] text-muted-foreground">
          Nema podataka u ovom periodu
        </div>
      ) : (
        <div className="h-[140px] -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${dataType}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(var(--primary))" />
                  <stop offset="100%" stopColor="hsl(322 78% 60%)" />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="recorded_for"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v) => {
                  const d = new Date(v);
                  return `${d.getDate()}.${d.getMonth() + 1}`;
                }}
                axisLine={false}
                tickLine={false}
                minTickGap={20}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--surface))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(v) => new Date(v as string).toLocaleDateString("sr-RS")}
                formatter={(v: any) => [
                  `${Number(v).toFixed(1)} ${meta?.unit ?? ""}`,
                  meta?.label ?? dataType,
                ]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={`url(#grad-${dataType})`}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};
