import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dumbbell, ChevronRight, Flame, Heart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui-bits";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDuration } from "@/lib/wearable/hrZones";
import { InAppWorkoutDetailDialog } from "@/components/InAppWorkoutDetailDialog";

interface Props {
  /** Ako je dat (trener gleda vezbaca), lista se filtrira po tom athlete_id.
   *  Inace se prikazuju treninzi trenutnog korisnika. RLS dozvoljava oba. */
  athleteId?: string;
  limit?: number;
}

interface Row {
  id: string;
  day_number: number;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  active_calories: number | null;
  hr_avg: number | null;
  hr_max: number | null;
  total_volume_kg: number | null;
  program_name: string | null;
  day_name: string | null;
  sets_done: number | null;
}

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

const titleFor = (w: Row): string => {
  const day = w.day_name ?? `Dan ${w.day_number}`;
  return w.program_name ? `${w.program_name} - ${day}` : day;
};

export const InAppWorkoutsList = ({ athleteId, limit = 10 }: Props) => {
  const { user } = useAuth();
  const targetId = athleteId ?? user?.id ?? null;
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["inapp_workouts", targetId, limit],
    enabled: !!targetId,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.rpc("get_athlete_inapp_workouts" as any, {
        p_user_id: targetId,
        p_limit: limit,
      });
      if (error) throw error;
      return (data as Row[]) ?? [];
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
      <Card className="p-5 text-center text-[13px] text-muted-foreground">
        Nema treninga još
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {data.map((w) => {
          const noWatch = w.active_calories == null && w.hr_avg == null;
          return (
            <button
              key={w.id}
              onClick={() => setOpenSessionId(w.id)}
              className="block w-full text-left active:scale-[0.99] transition"
            >
              <Card className="p-3.5">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-2xl bg-gradient-brand text-primary-foreground flex items-center justify-center shrink-0 shadow-brand">
                    <Dumbbell className="h-5 w-5" strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-display text-[15px] font-bold tracking-tight truncate">
                        {titleFor(w)}
                      </div>
                      <div className="text-[11px] text-muted-foreground shrink-0">
                        {formatRelativeDay(w.completed_at ?? w.started_at)}
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
                      {noWatch && w.sets_done != null && w.sets_done > 0 && (
                        <span>{w.sets_done} serija</span>
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

      <InAppWorkoutDetailDialog
        sessionId={openSessionId}
        open={!!openSessionId}
        onOpenChange={(o) => !o && setOpenSessionId(null)}
      />
    </>
  );
};
