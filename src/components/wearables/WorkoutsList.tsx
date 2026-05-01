import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Dumbbell, Flame, Heart, Bike, Footprints, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui-bits";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDuration } from "@/lib/wearable/hrZones";
import { WorkoutDetailDialog } from "./WorkoutDetailDialog";

interface Props {
  userId?: string;
  limit?: number;
}

interface WorkoutRow {
  id: string;
  workout_type: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  total_calories: number | null;
  active_calories: number | null;
  hr_avg: number | null;
  hr_max: number | null;
}

const iconForType = (type: string | null) => {
  const t = (type ?? "").toLowerCase();
  if (t.includes("run") || t.includes("trcanje") || t.includes("walk")) return Footprints;
  if (t.includes("cycle") || t.includes("bike") || t.includes("bicikl")) return Bike;
  if (t.includes("strength") || t.includes("weights") || t.includes("snaga")) return Dumbbell;
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

const formatRelativeDay = (iso: string): string => {
  const d = new Date(iso);
  const today = new Date();
  const diffMs = today.setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0);
  const days = Math.round(diffMs / (24 * 3600 * 1000));
  if (days === 0) return "Danas";
  if (days === 1) return "Juče";
  if (days < 7) return `Pre ${days} dana`;
  return d.toLocaleDateString("sr-Latn-RS", { day: "numeric", month: "short" });
};

export const WorkoutsList = ({ userId, limit = 10 }: Props) => {
  const { user } = useAuth();
  const targetId = userId ?? user?.id ?? null;
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["wearable_workouts", targetId, limit],
    enabled: !!targetId,
    queryFn: async (): Promise<WorkoutRow[]> => {
      const { data, error } = await supabase.rpc("get_athlete_workouts" as any, {
        p_user_id: targetId,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as WorkoutRow[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[68px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="p-5 text-center">
        <div className="text-[12px] text-muted-foreground">Još nema treninga</div>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {data.map((w) => {
          const Icon = iconForType(w.workout_type);
          return (
            <button
              key={w.id}
              onClick={() => setOpenId(w.id)}
              className="block w-full text-left active:scale-[0.99] transition"
            >
              <Card className="p-3.5">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-2xl bg-gradient-brand text-primary-foreground flex items-center justify-center shrink-0 shadow-brand">
                    <Icon className="h-5 w-5" strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-display text-[15px] font-bold tracking-tight truncate">
                        {labelForType(w.workout_type)}
                      </div>
                      <div className="text-[11px] text-muted-foreground shrink-0">
                        {formatRelativeDay(w.started_at)}
                      </div>
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-[12px] text-muted-foreground">
                      <span>{formatDuration(w.duration_seconds ?? 0)}</span>
                      {w.active_calories != null && (
                        <span className="inline-flex items-center gap-1">
                          <Flame className="h-3 w-3" /> {Math.round(w.active_calories)} kcal
                        </span>
                      )}
                      {w.hr_avg != null && (
                        <span className="inline-flex items-center gap-1">
                          <Heart className="h-3 w-3" /> {w.hr_avg} bpm
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </Card>
            </button>
          );
        })}
      </div>
      <WorkoutDetailDialog
        workoutId={openId}
        open={!!openId}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
    </>
  );
};
