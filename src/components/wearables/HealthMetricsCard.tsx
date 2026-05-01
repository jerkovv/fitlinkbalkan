import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Heart, Moon, Footprints, Battery, Activity, Flame, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui-bits";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Metric {
  data_type: string;
  value: number;
  unit: string | null;
  recorded_for: string;
  recorded_at: string;
  provider: string;
  prev_value: number | null;
}

interface Props {
  userId?: string;
  /** Da li prikazati CTA dugme za /vezbac/integracije kad nema podataka */
  showConnectCta?: boolean;
}

const tiles: Array<{
  type: string;
  label: string;
  icon: typeof Heart;
  format: (v: number) => { value: string; unit: string };
  /** Da li je veća vrednost bolja (utiče na boju trenda) */
  higherIsBetter: boolean;
}> = [
  {
    type: "heart_rate_avg",
    label: "Prosečan puls",
    icon: Heart,
    format: (v) => ({ value: Math.round(v).toString(), unit: "bpm" }),
    higherIsBetter: false,
  },
  {
    type: "heart_rate_max",
    label: "Max puls",
    icon: Activity,
    format: (v) => ({ value: Math.round(v).toString(), unit: "bpm" }),
    higherIsBetter: false,
  },
  {
    type: "workout_duration",
    label: "Trening",
    icon: Flame,
    format: (v) => ({ value: Math.round(v).toString(), unit: "min" }),
    higherIsBetter: true,
  },
  {
    type: "heart_rate_resting",
    label: "Puls u mirovanju",
    icon: Heart,
    format: (v) => ({ value: Math.round(v).toString(), unit: "bpm" }),
    higherIsBetter: false,
  },
  {
    type: "sleep_minutes",
    label: "San",
    icon: Moon,
    format: (v) => {
      const h = Math.floor(v / 60);
      const m = Math.round(v % 60);
      return { value: `${h}.${Math.round((m / 60) * 10)}`, unit: "h" };
    },
    higherIsBetter: true,
  },
  {
    type: "steps",
    label: "Koraci",
    icon: Footprints,
    format: (v) => ({ value: Math.round(v).toLocaleString("sr-RS"), unit: "" }),
    higherIsBetter: true,
  },
  {
    type: "calories_active",
    label: "Kalorije",
    icon: Flame,
    format: (v) => ({ value: Math.round(v).toString(), unit: "kcal" }),
    higherIsBetter: true,
  },
  {
    type: "recovery_score",
    label: "Oporavak",
    icon: Battery,
    format: (v) => ({ value: Math.round(v).toString(), unit: "%" }),
    higherIsBetter: true,
  },
];

export const HealthMetricsCard = ({ userId, showConnectCta = true }: Props) => {
  const { user } = useAuth();
  const targetId = userId ?? user?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["wearable_latest", targetId],
    enabled: !!targetId,
    queryFn: async (): Promise<Metric[]> => {
      const { data, error } = await supabase.rpc(
        "get_latest_wearable_metrics" as any,
        { p_user_id: targetId },
      );
      if (error) throw error;
      return (data ?? []) as Metric[];
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
    );
  }

  const byType = new Map((data ?? []).map((m) => [m.data_type, m]));
  const visible = tiles.filter((t) => byType.has(t.type)).slice(0, 4);

  if (visible.length === 0) {
    return (
      <Card className="p-5 text-center bg-gradient-brand-soft border-0">
        <div className="text-[13px] font-semibold text-foreground mb-1">
          Nema zdravstvenih podataka
        </div>
        <div className="text-[12px] text-muted-foreground mb-3">
          Poveži uređaj da vidiš svoje podatke
        </div>
        {showConnectCta && (
          <Link
            to="/vezbac/integracije"
            className="inline-flex items-center justify-center rounded-md bg-gradient-brand text-primary-foreground text-[13px] font-semibold px-4 py-2 shadow-brand hover:opacity-95"
          >
            Poveži uređaj
          </Link>
        )}
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {visible.map((t) => {
        const m = byType.get(t.type)!;
        const fmt = t.format(Number(m.value));
        const Icon = t.icon;
        const prev = m.prev_value != null ? Number(m.prev_value) : null;
        const diff = prev != null ? Number(m.value) - prev : null;
        const trendUp = diff != null && diff > 0;
        const trendDown = diff != null && diff < 0;
        const positive =
          diff == null
            ? null
            : t.higherIsBetter
              ? diff > 0
              : diff < 0;

        return (
          <Card key={t.type} className="p-3.5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {t.label}
              </div>
              <Icon className="h-3.5 w-3.5 text-primary" strokeWidth={2.25} />
            </div>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="font-display text-[26px] leading-none font-bold tracking-tightest">
                {fmt.value}
              </span>
              {fmt.unit && (
                <span className="text-[12px] font-medium text-muted-foreground">
                  {fmt.unit}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[11px]">
              {diff == null ? (
                <span className="text-muted-foreground">prvi put</span>
              ) : (
                <>
                  {trendUp && <ArrowUp className="h-3 w-3" />}
                  {trendDown && <ArrowDown className="h-3 w-3" />}
                  {!trendUp && !trendDown && <Minus className="h-3 w-3" />}
                  <span
                    className={cn(
                      "font-semibold",
                      positive === true && "text-success-soft-foreground",
                      positive === false && "text-destructive",
                      positive === null && "text-muted-foreground",
                    )}
                  >
                    {Math.abs(diff!).toFixed(diff! < 1 && diff! > -1 ? 1 : 0)}
                  </span>
                  <span className="text-muted-foreground">vs prethodno</span>
                </>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
};
