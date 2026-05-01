import { useQuery } from "@tanstack/react-query";
import {
  Activity, Dumbbell, Flame, Bike, Footprints, Clock, Heart,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui-bits";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  computeMaxHR, formatDuration, type HRSample,
} from "@/lib/wearable/hrZones";
import { HRZonesChart } from "./HRZonesChart";
import { HRTimeSeriesChart } from "./HRTimeSeriesChart";

interface Props {
  workoutId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

interface WorkoutDetail {
  id: string;
  user_id: string;
  workout_type: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  total_distance_m: number | null;
  total_calories: number | null;
  active_calories: number | null;
  hr_avg: number | null;
  hr_max: number | null;
  hr_min: number | null;
  hr_series: HRSample[] | null;
  zones: Array<{
    zone: number;
    zone_name: string | null;
    min_bpm: number | null;
    max_bpm: number | null;
    seconds_in_zone: number;
  }> | null;
  splits: any;
}

const iconForType = (type: string | null) => {
  const t = (type ?? "").toLowerCase();
  if (t.includes("run") || t.includes("walk")) return Footprints;
  if (t.includes("cycle") || t.includes("bike")) return Bike;
  if (t.includes("strength") || t.includes("weights")) return Dumbbell;
  if (t.includes("hiit") || t.includes("interval")) return Flame;
  return Activity;
};

const labelForType = (type: string | null): string => {
  const t = (type ?? "").toLowerCase();
  if (!t) return "Trening";
  if (t.includes("run")) return "Trčanje";
  if (t.includes("walk")) return "Hodanje";
  if (t.includes("cycle") || t.includes("bike")) return "Biciklizam";
  if (t.includes("strength") || t.includes("weights")) return "Snaga";
  if (t.includes("hiit") || t.includes("interval")) return "HIIT";
  if (t.includes("yoga")) return "Joga";
  if (t.includes("swim")) return "Plivanje";
  return "Trening";
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("sr-Latn-RS", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

export const WorkoutDetailDialog = ({ workoutId, open, onOpenChange }: Props) => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["wearable_workout_detail", workoutId],
    enabled: !!workoutId && open,
    queryFn: async (): Promise<WorkoutDetail | null> => {
      const { data, error } = await supabase.rpc("get_workout_detail" as any, {
        p_workout_id: workoutId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as WorkoutDetail | null;
    },
  });

  // Fallback max HR (kada nema user_hr_config), računa iz birth_year vežbača
  const { data: athBirthYear } = useQuery({
    queryKey: ["athlete_birth_year", data?.user_id],
    enabled: !!data?.user_id,
    queryFn: async (): Promise<number | null> => {
      const { data: row } = await supabase
        .from("athletes")
        .select("birth_year")
        .eq("id", data!.user_id)
        .maybeSingle();
      return ((row as any)?.birth_year as number | null) ?? null;
    },
  });

  const maxHR = computeMaxHR(athBirthYear ?? null);

  const Icon = iconForType(data?.workout_type ?? null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[402px] p-0 overflow-hidden gap-0 sm:rounded-2xl border-border bg-background max-h-[90vh] overflow-y-auto">
        <DialogTitle className="sr-only">Detalji treninga</DialogTitle>
        <DialogDescription className="sr-only">
          Pregled treninga sa pulsom i zonama
        </DialogDescription>

        {isLoading ? (
          <div className="p-5 space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : !data ? (
          <div className="p-8 text-center text-[13px] text-muted-foreground">
            Trening nije pronađen
          </div>
        ) : (
          <div className="space-y-4 p-5">
            {/* Header */}
            <div className="flex items-start gap-3 pr-8">
              <div className="h-14 w-14 rounded-2xl bg-gradient-brand text-primary-foreground flex items-center justify-center shadow-brand shrink-0">
                <Icon className="h-6 w-6" strokeWidth={2.25} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-[22px] font-bold tracking-tightest leading-tight">
                  {labelForType(data.workout_type)}
                </div>
                <div className="text-[12px] text-muted-foreground mt-0.5">
                  {fmtDate(data.started_at)}
                </div>
                <div className="text-[12px] text-muted-foreground tnum">
                  {fmtTime(data.started_at)}
                  {data.ended_at && ` - ${fmtTime(data.ended_at)}`}
                </div>
              </div>
            </div>

            {/* Stats 2x2 */}
            <Card className="p-4">
              <div className="grid grid-cols-2 gap-4">
                <Stat
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Trajanje"
                  value={formatDuration(data.duration_seconds ?? 0)}
                />
                <Stat
                  icon={<Flame className="h-3.5 w-3.5" />}
                  label="Aktivne kalorije"
                  value={data.active_calories != null ? `${Math.round(data.active_calories)}` : "-"}
                  unit="kcal"
                />
                <Stat
                  icon={<Flame className="h-3.5 w-3.5" />}
                  label="Ukupno kalorija"
                  value={data.total_calories != null ? `${Math.round(data.total_calories)}` : "-"}
                  unit="kcal"
                />
                <Stat
                  icon={<Heart className="h-3.5 w-3.5" />}
                  label="Prosečan puls"
                  value={data.hr_avg != null ? `${data.hr_avg}` : "-"}
                  unit="bpm"
                />
              </div>
            </Card>

            {/* HR time series */}
            {data.hr_series && data.hr_series.length > 0 && (
              <Card className="p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
                  Puls tokom treninga
                </div>
                <HRTimeSeriesChart
                  hrSeries={data.hr_series}
                  maxHR={maxHR}
                  hrAvg={data.hr_avg}
                  hrMax={data.hr_max}
                />
              </Card>
            )}

            {/* Zones */}
            {data.zones && data.zones.some((z) => z.seconds_in_zone > 0) && (
              <Card className="p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
                  Zone pulsa
                </div>
                <HRZonesChart zones={data.zones} />
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const Stat = ({
  icon, label, value, unit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
}) => (
  <div>
    <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {icon} {label}
    </div>
    <div className="flex items-baseline gap-1 mt-1">
      <span className="font-display text-[22px] leading-none font-bold tracking-tightest">
        {value}
      </span>
      {unit && (
        <span className="text-[11px] font-medium text-muted-foreground">
          {unit}
        </span>
      )}
    </div>
  </div>
);
