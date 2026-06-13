import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dumbbell, Flame, Clock, Heart, Minus, TrendingUp, TrendingDown } from "lucide-react";
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  computeMaxHR, computeZones, formatDuration, type HRSample,
} from "@/lib/wearable/hrZones";
import { HRTimeSeriesChart } from "@/components/wearables/HRTimeSeriesChart";
import { HRZonesChart } from "@/components/wearables/HRZonesChart";

interface Props {
  sessionId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

interface InAppSet {
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  rpe: number | null;
  done: boolean;
}

interface InAppExercise {
  exercise_name: string;
  planned_sets: number;
  planned_reps: string | null;
  planned_weight_kg: number | null;
  done_count: number;
  sets: InAppSet[];
}

interface InAppDetail {
  success: boolean;
  id: string;
  day_number: number;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  total_volume_kg: number | null;
  active_calories: number | null;
  hr_avg: number | null;
  hr_max: number | null;
  hr_series: HRSample[] | null;
  notes: string | null;
  program_name: string | null;
  day_name: string | null;
  birth_year: number | null;
  sets_done: number | null;
  exercises: InAppExercise[] | null;
}

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

export const InAppWorkoutDetailDialog = ({ sessionId, open, onOpenChange }: Props) => {
  const { data, isLoading } = useQuery({
    queryKey: ["inapp_workout_detail", sessionId],
    enabled: !!sessionId && open,
    queryFn: async (): Promise<InAppDetail | null> => {
      const { data, error } = await supabase.rpc("get_inapp_workout_detail" as any, {
        p_session_id: sessionId,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as any;
      return (row ?? null) as InAppDetail | null;
    },
  });

  const detail = data && data.success ? data : null;

  const maxHR = computeMaxHR(detail?.birth_year ?? null);
  const zones = useMemo(
    () => (detail?.hr_series ? computeZones(detail.hr_series, maxHR) : []),
    [detail, maxHR],
  );

  const whenISO = detail?.completed_at ?? detail?.started_at ?? null;
  const title = detail
    ? detail.program_name && detail.day_name
      ? `${detail.program_name} - ${detail.day_name}`
      : `Dan ${detail.day_number}`
    : "Trening";

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
        ) : !detail ? (
          <div className="p-8 text-center text-[13px] text-muted-foreground">
            Trening nije pronađen
          </div>
        ) : (
          <div className="space-y-4 p-5">
            {/* Header */}
            <div className="flex items-start gap-3 pr-8">
              <div className="h-14 w-14 rounded-2xl bg-gradient-brand text-primary-foreground flex items-center justify-center shadow-brand shrink-0">
                <Dumbbell className="h-6 w-6" strokeWidth={2.25} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-[22px] font-bold tracking-tightest leading-tight">
                  {title}
                </div>
                {whenISO && (
                  <>
                    <div className="text-[12px] text-muted-foreground mt-0.5">
                      {fmtDate(whenISO)}
                    </div>
                    <div className="text-[12px] text-muted-foreground tnum">
                      {fmtTime(whenISO)}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Stats 2x2 */}
            <Card className="p-4">
              <div className="grid grid-cols-2 gap-4">
                <Stat
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Trajanje"
                  value={formatDuration(detail.duration_seconds ?? 0)}
                />
                <Stat
                  icon={<Flame className="h-3.5 w-3.5" />}
                  label="Aktivne kalorije"
                  value={detail.active_calories != null ? `${Math.round(detail.active_calories)}` : "-"}
                  unit="kcal"
                />
                <Stat
                  icon={<Heart className="h-3.5 w-3.5" />}
                  label="Prosečan puls"
                  value={detail.hr_avg != null ? `${detail.hr_avg}` : "-"}
                  unit="bpm"
                />
                <Stat
                  icon={<Heart className="h-3.5 w-3.5" />}
                  label="Max puls"
                  value={detail.hr_max != null ? `${detail.hr_max}` : "-"}
                  unit="bpm"
                />
              </div>
            </Card>

            {/* Volumen / Setovi (samo ako ima volumena) */}
            {detail.total_volume_kg != null && detail.total_volume_kg > 0 && (
              <Card className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <Stat
                    icon={<Dumbbell className="h-3.5 w-3.5" />}
                    label="Volumen"
                    value={Math.round(detail.total_volume_kg).toLocaleString("sr-Latn-RS")}
                    unit="kg"
                  />
                  <Stat
                    icon={<Dumbbell className="h-3.5 w-3.5" />}
                    label="Setovi"
                    value={`${detail.sets_done ?? 0}`}
                  />
                </div>
              </Card>
            )}

            {/* HR time series */}
            {detail.hr_series && detail.hr_series.length > 0 && (
              <Card className="p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
                  Puls tokom treninga
                </div>
                <HRTimeSeriesChart
                  hrSeries={detail.hr_series}
                  maxHR={maxHR}
                  hrAvg={detail.hr_avg}
                  hrMax={detail.hr_max}
                />
              </Card>
            )}

            {/* Zone */}
            {zones.some((z) => z.seconds_in_zone > 0) && (
              <Card className="p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
                  Zone pulsa
                </div>
                <HRZonesChart zones={zones} />
              </Card>
            )}

            {/* Vežbe (serije: planirano vs uradjeno) */}
            {detail.exercises && detail.exercises.length > 0 && (
              <Card className="p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
                  Vežbe
                </div>
                <div className="space-y-3">
                  {detail.exercises.map((ex, i) => (
                    <div key={i} className="rounded-2xl border border-hairline overflow-hidden">
                      <div className="px-3.5 py-2.5 bg-surface-2 border-b border-hairline flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-[14px] tracking-tight truncate">
                            {ex.exercise_name}
                          </div>
                          <div className="text-[11.5px] text-muted-foreground mt-0.5">
                            Plan: {ex.planned_sets} × {ex.planned_reps ?? "-"}
                            {ex.planned_weight_kg != null ? ` @ ${ex.planned_weight_kg} kg` : ""}
                          </div>
                        </div>
                        <span className="shrink-0 text-[11px] font-bold tnum px-2 py-0.5 rounded-full bg-success-soft text-success-soft-foreground">
                          {ex.done_count}/{ex.planned_sets}
                        </span>
                      </div>
                      <div className="px-3.5 py-2 space-y-1">
                        {(ex.sets ?? []).map((s) => {
                          // Delta vs plan: stvarna tezina - planirana (samo kad ima plana).
                          const wDelta =
                            ex.planned_weight_kg != null && s.weight_kg != null
                              ? s.weight_kg - ex.planned_weight_kg
                              : null;
                          return (
                            <div
                              key={s.set_number}
                              className="flex items-center justify-between gap-2 text-[13px] tnum py-0.5"
                            >
                              <span
                                className={cn(
                                  "flex-1 min-w-0",
                                  s.done ? "text-foreground" : "text-muted-foreground/50",
                                )}
                              >
                                Serija {s.set_number}: {s.reps ?? "-"}
                                {s.weight_kg != null ? ` x ${s.weight_kg} kg` : ""}
                                {s.rpe != null ? ` - RPE ${s.rpe}` : ""}
                              </span>
                              {wDelta != null && wDelta !== 0 && s.done && (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-0.5 text-[10px] font-semibold shrink-0",
                                    wDelta > 0 ? "text-success" : "text-destructive",
                                  )}
                                >
                                  {wDelta > 0 ? (
                                    <TrendingUp className="h-3 w-3" />
                                  ) : (
                                    <TrendingDown className="h-3 w-3" />
                                  )}
                                  {wDelta > 0 ? "+" : ""}{wDelta}kg
                                </span>
                              )}
                              {s.done ? (
                                <div className="h-5 w-5 rounded-full bg-success/15 text-success flex items-center justify-center text-[10px] font-bold shrink-0">
                                  ✓
                                </div>
                              ) : (
                                <Minus className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Beleška */}
            {detail.notes && (
              <Card className="p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1">
                  Beleška
                </div>
                <div className="text-[13px] leading-snug">{detail.notes}</div>
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
