import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Activity, Dumbbell, Flame, Heart, Bike, Footprints, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui-bits";
import { Skeleton } from "@/components/ui/skeleton";
import { porukaGreske } from "@/lib/errorMessage";
import { formatDuration } from "@/lib/wearable/hrZones";
import { WorkoutDetailDialog } from "./WorkoutDetailDialog";

interface Props {
  userId?: string;
  limit?: number;
  /** Trener na racunaru: "Učitaj starije treninge" po 30 i poruka kad citanje padne. */
  stranicenje?: boolean;
  /** Tekst kad treninga nema, umesto opsteg. */
  prazno?: string;
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

export const WorkoutsList = ({ userId, limit = 10, stranicenje = false, prazno }: Props) => {
  const { user } = useAuth();
  const targetId = userId ?? user?.id ?? null;
  const [openId, setOpenId] = useState<string | null>(null);
  const [granica, setGranica] = useState(limit);
  const koliko = stranicenje ? granica : limit;

  const { data, isLoading, isError, error: greska, isPlaceholderData, refetch, isFetching } = useQuery({
    queryKey: ["wearable_workouts", targetId, koliko],
    enabled: !!targetId,
    // Dok stizu stariji, spisak ostaje na ekranu umesto da se zameni kosturom.
    placeholderData: stranicenje ? keepPreviousData : undefined,
    queryFn: async (): Promise<WorkoutRow[]> => {
      const { data, error } = await supabase.rpc("get_athlete_workouts" as any, {
        p_user_id: targetId,
        p_limit: koliko,
      });
      if (error) throw error;
      return (data ?? []) as WorkoutRow[];
    },
  });

  useEffect(() => {
    if (stranicenje && greska) toast.error(porukaGreske(greska));
  }, [stranicenje, greska]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[68px] rounded-xl" />
        ))}
      </div>
    );
  }

  // Pad citanja nije isto sto i "nema treninga".
  if (stranicenje && isError) {
    return (
      <Card className="p-5 text-center">
        <div className="text-[13px] text-muted-foreground">Treninzi sa sata nisu učitani.</div>
        <Button
          variant="outline"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="mt-3 h-9 rounded-full px-4 text-[13px]"
        >
          {isFetching && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Pokušaj ponovo
        </Button>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="p-5 text-center">
        <div className="text-[12px] text-muted-foreground">{prazno ?? "Još nema treninga"}</div>
      </Card>
    );
  }

  const imaJos = stranicenje && !isPlaceholderData && data.length >= koliko;

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
      {(imaJos || (stranicenje && isPlaceholderData)) && (
        <Button
          variant="outline"
          onClick={() => setGranica((n) => n + 30)}
          disabled={isPlaceholderData}
          className="mt-3 h-10 w-full rounded-full"
        >
          {isPlaceholderData && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Učitaj starije treninge
        </Button>
      )}
      <WorkoutDetailDialog
        workoutId={openId}
        open={!!openId}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
    </>
  );
};
