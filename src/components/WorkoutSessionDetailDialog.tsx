import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { Loader2, Dumbbell, Clock, CalendarDays, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  sessionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type SessionMeta = {
  id: string;
  day_number: number;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  notes: string | null;
  day_id: string;
  assigned_program_id: string;
  day_name: string;
  program_name: string;
};

type ExerciseRow = {
  id: string;
  position: number;
  sets: number;
  planned_reps: string | null;
  planned_weight: number | null;
  exercise_name: string;
  primary_muscle: string | null;
  set_logs: Array<{
    set_number: number;
    reps: number | null;
    weight_kg: number | null;
    rpe: number | null;
    done: boolean;
  }>;
};

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("sr-RS", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const formatDuration = (sec: number | null) => {
  if (!sec) return "—";
  const m = Math.round(sec / 60);
  return `${m} min`;
};

export const WorkoutSessionDetailDialog = ({ sessionId, open, onOpenChange }: Props) => {
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);

  useEffect(() => {
    if (!open || !sessionId) return;

    const load = async () => {
      setLoading(true);
      setMeta(null);
      setExercises([]);

      // 1. Sesija + dan + program
      const { data: sessionData } = await supabase
        .from("workout_session_logs")
        .select(
          "id, day_number, started_at, completed_at, duration_seconds, notes, day_id, assigned_program_id"
        )
        .eq("id", sessionId)
        .maybeSingle();

      if (!sessionData) {
        setLoading(false);
        return;
      }

      const s: any = sessionData;

      const [{ data: dayData }, { data: progData }] = await Promise.all([
        supabase
          .from("assigned_program_days")
          .select("name")
          .eq("id", s.day_id)
          .maybeSingle(),
        supabase
          .from("assigned_programs")
          .select("name")
          .eq("id", s.assigned_program_id)
          .maybeSingle(),
      ]);

      setMeta({
        ...s,
        day_name: (dayData as any)?.name ?? `Dan ${s.day_number}`,
        program_name: (progData as any)?.name ?? "—",
      });

      // 2. Vežbe iz dana (planirano)
      const { data: exData } = await supabase
        .from("assigned_program_exercises")
        .select(
          "id, position, sets, reps, weight_kg, exercise_id, exercises(name, primary_muscle)"
        )
        .eq("day_id", s.day_id)
        .order("position", { ascending: true });

      // 3. Set logs za sesiju
      const { data: logs } = await supabase
        .from("set_logs")
        .select("exercise_id, set_number, reps, weight_kg, rpe, done")
        .eq("session_log_id", sessionId);

      const logsByEx: Record<string, any[]> = {};
      for (const l of (logs as any[]) ?? []) {
        if (!logsByEx[l.exercise_id]) logsByEx[l.exercise_id] = [];
        logsByEx[l.exercise_id].push(l);
      }

      const rows: ExerciseRow[] = ((exData as any[]) ?? []).map((ex) => ({
        id: ex.id,
        position: ex.position,
        sets: ex.sets,
        planned_reps: ex.reps,
        planned_weight: ex.weight_kg,
        exercise_name: ex.exercises?.name ?? "Vežba",
        primary_muscle: ex.exercises?.primary_muscle ?? null,
        set_logs: (logsByEx[ex.id] ?? []).sort((a, b) => a.set_number - b.set_number),
      }));

      setExercises(rows);
      setLoading(false);
    };

    load();
  }, [open, sessionId]);

  // Agregat: tonaža + completion rate
  const totalVolume = exercises.reduce((acc, ex) => {
    return (
      acc +
      ex.set_logs
        .filter((s) => s.done)
        .reduce((a, s) => a + (Number(s.weight_kg) || 0) * (Number(s.reps) || 0), 0)
    );
  }, 0);

  const totalSetsPlanned = exercises.reduce((acc, ex) => acc + ex.sets, 0);
  const totalSetsDone = exercises.reduce(
    (acc, ex) => acc + ex.set_logs.filter((s) => s.done).length,
    0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto p-0">
        <DialogHeader className="p-5 pb-3 border-b border-hairline sticky top-0 bg-card z-10">
          <DialogTitle className="font-display text-xl font-bold tracking-tight">
            {loading ? "Učitavanje…" : meta?.day_name ?? "Trening"}
          </DialogTitle>
          {meta && (
            <div className="text-[12px] text-muted-foreground mt-0.5">
              {meta.program_name} · Dan {meta.day_number}
            </div>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !meta ? (
          <div className="p-6 text-center text-[13px] text-muted-foreground">
            Trening nije pronađen.
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Meta strip */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-surface-2 p-3 text-center">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-1" />
                <div className="text-[11px] text-muted-foreground">Datum</div>
                <div className="text-[12.5px] font-bold tnum mt-0.5">
                  {meta.completed_at
                    ? new Date(meta.completed_at).toLocaleDateString("sr-RS", {
                        day: "numeric",
                        month: "short",
                      })
                    : "—"}
                </div>
              </div>
              <div className="rounded-2xl bg-surface-2 p-3 text-center">
                <Clock className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-1" />
                <div className="text-[11px] text-muted-foreground">Trajanje</div>
                <div className="text-[12.5px] font-bold tnum mt-0.5">
                  {formatDuration(meta.duration_seconds)}
                </div>
              </div>
              <div className="rounded-2xl bg-surface-2 p-3 text-center">
                <Dumbbell className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-1" />
                <div className="text-[11px] text-muted-foreground">Setovi</div>
                <div className="text-[12.5px] font-bold tnum mt-0.5">
                  {totalSetsDone}/{totalSetsPlanned}
                </div>
              </div>
            </div>

            {/* Tonaža */}
            <div className="rounded-2xl bg-gradient-brand-soft p-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/80">
                  Ukupna tonaža
                </div>
                <div className="font-display text-[26px] font-bold tracking-tighter tnum text-primary mt-0.5">
                  {totalVolume.toLocaleString("sr-RS")} kg
                </div>
              </div>
              <Dumbbell className="h-7 w-7 text-primary/60" />
            </div>

            {/* Vežbe */}
            <div className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Vežbe — planirano vs urađeno
              </div>

              {exercises.length === 0 ? (
                <div className="rounded-2xl border border-hairline p-4 text-center text-[13px] text-muted-foreground">
                  Nema dodatih vežbi.
                </div>
              ) : (
                exercises.map((ex) => (
                  <div
                    key={ex.id}
                    className="rounded-2xl border border-hairline overflow-hidden bg-card"
                  >
                    <div className="px-3.5 py-2.5 bg-surface-2 border-b border-hairline">
                      <div className="font-semibold text-[14px] tracking-tight truncate">
                        {ex.exercise_name}
                      </div>
                      <div className="text-[11.5px] text-muted-foreground mt-0.5">
                        Plan: {ex.sets} × {ex.planned_reps ?? "—"}
                        {ex.planned_weight ? ` @ ${ex.planned_weight} kg` : ""}
                      </div>
                    </div>

                    <div className="px-3.5 py-2">
                      <div className="grid grid-cols-[20px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_28px] gap-1.5 pb-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80 font-semibold border-b border-hairline">
                        <span>#</span>
                        <span className="text-center">KG</span>
                        <span className="text-center">Reps</span>
                        <span className="text-center">RPE</span>
                        <span></span>
                      </div>

                      {Array.from({ length: ex.sets }).map((_, i) => {
                        const setNum = i + 1;
                        const log = ex.set_logs.find((l) => l.set_number === setNum);
                        const done = log?.done;

                        const planW = ex.planned_weight;
                        const actW = log?.weight_kg != null ? Number(log.weight_kg) : null;
                        const wDelta =
                          planW != null && actW != null ? actW - Number(planW) : null;

                        return (
                          <div
                            key={i}
                            className="grid grid-cols-[20px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_28px] gap-1.5 items-center py-1.5 border-b border-hairline last:border-b-0 text-[13px] tnum"
                          >
                            <span className="text-[11.5px] text-muted-foreground font-semibold">
                              {setNum}
                            </span>
                            <div
                              className={cn(
                                "text-center font-bold flex items-center justify-center gap-1",
                                done ? "text-foreground" : "text-muted-foreground/50"
                              )}
                            >
                              {actW ?? "–"}
                              {wDelta != null && wDelta !== 0 && done && (
                                <span
                                  className={cn(
                                    "text-[10px] font-semibold",
                                    wDelta > 0 ? "text-success" : "text-warn"
                                  )}
                                >
                                  {wDelta > 0 ? (
                                    <TrendingUp className="h-3 w-3 inline" />
                                  ) : (
                                    <TrendingDown className="h-3 w-3 inline" />
                                  )}
                                </span>
                              )}
                            </div>
                            <div
                              className={cn(
                                "text-center font-bold",
                                done ? "text-foreground" : "text-muted-foreground/50"
                              )}
                            >
                              {log?.reps ?? "–"}
                            </div>
                            <div
                              className={cn(
                                "text-center font-bold",
                                done ? "text-foreground" : "text-muted-foreground/50"
                              )}
                            >
                              {log?.rpe ?? "–"}
                            </div>
                            <div className="flex justify-center">
                              {done ? (
                                <div className="h-5 w-5 rounded-full bg-success/15 text-success flex items-center justify-center text-[10px] font-bold">
                                  ✓
                                </div>
                              ) : (
                                <Minus className="h-3 w-3 text-muted-foreground/40" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {meta.notes && (
              <div className="rounded-2xl bg-surface-2 p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1">
                  Beleška vežbača
                </div>
                <div className="text-[13px] leading-snug">{meta.notes}</div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
