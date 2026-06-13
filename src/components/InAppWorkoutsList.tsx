import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dumbbell, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui-bits";
import { Skeleton } from "@/components/ui/skeleton";
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
  completed_at: string | null;
  duration_seconds: number | null;
}

const fmtDate = (iso: string | null) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("sr-Latn-RS", { day: "numeric", month: "short" });
};

const fmtDuration = (sec: number | null) => {
  if (!sec) return "-";
  return `${Math.round(sec / 60)} min`;
};

export const InAppWorkoutsList = ({ athleteId, limit = 10 }: Props) => {
  const { user } = useAuth();
  const targetId = athleteId ?? user?.id ?? null;
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["inapp_workouts", targetId, limit],
    enabled: !!targetId,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("workout_session_logs")
        .select("id, day_number, completed_at, duration_seconds")
        .eq("athlete_id", targetId as string)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(limit);
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
        {data.map((log) => (
          <button
            key={log.id}
            onClick={() => setOpenSessionId(log.id)}
            className="block w-full text-left active:scale-[0.99] transition"
          >
            <Card className="p-4 flex items-center gap-3 hover:bg-surface-2 transition">
              <div className="h-10 w-10 rounded-2xl bg-gradient-brand-soft text-primary flex items-center justify-center shrink-0">
                <Dumbbell className="h-[18px] w-[18px]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold tracking-tight">
                  Dan {log.day_number}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {fmtDate(log.completed_at)} · {fmtDuration(log.duration_seconds)}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Card>
          </button>
        ))}
      </div>

      <InAppWorkoutDetailDialog
        sessionId={openSessionId}
        open={!!openSessionId}
        onOpenChange={(o) => !o && setOpenSessionId(null)}
      />
    </>
  );
};
