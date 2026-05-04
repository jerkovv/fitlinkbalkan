import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, X, Check, ChevronRight, MessageCircle, Heart } from "lucide-react";
import { getHrColor } from "@/lib/workout/hrZone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ExerciseHeader } from "@/components/workout/ExerciseHeader";
import { SetLogger } from "@/components/workout/SetLogger";
import { RestTimer } from "@/components/workout/RestTimer";

type DayExercise = {
  /** id of assigned_program_exercises row (used for set_logs.exercise_id per spec) */
  id: string;
  position: number;
  sets: number;
  reps: number | null;
  weight_kg: number | null;
  rest_seconds: number | null;
  /** Source exercise library id (for reference) */
  exercise_id: string;
  exercise: {
    name: string;
    name_en: string | null;
    primary_muscle: string | null;
    video_url: string | null;
    thumbnail_url: string | null;
    instructions: string | null;
  };
};

type DayFull = {
  day_id: string;
  day_number: number;
  day_name: string;
  assigned_program_id: string;
  exercises: DayExercise[];
};

type CompletedSet = {
  exerciseIndex: number;
  setNumber: number;
  reps: number;
  weight_kg: number;
};

type HRPoint = { ts: string; bpm: number };

const triggerHaptic = async () => {
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(60);
    }
  }
};

const fmtElapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const ActiveWorkout = () => {
  const { dayId } = useParams<{ dayId: string }>();
  const { user } = useAuth();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState<DayFull | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  const [exerciseIdx, setExerciseIdx] = useState(0);
  const [setNumber, setSetNumber] = useState(1);
  const [completedSets, setCompletedSets] = useState<CompletedSet[]>([]);
  const [currentSetStartedAt, setCurrentSetStartedAt] = useState<Date>(new Date());

  const [resting, setResting] = useState<{ seconds: number; subtitle: string } | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // Live HR
  const [liveHr, setLiveHr] = useState<number | null>(null);
  const hrSeriesRef = useRef<HRPoint[]>([]);

  // Wake lock
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  /* ------------------------- Init: start session + load day ------------------------- */
  useEffect(() => {
    if (!dayId || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);

      const { data: dayRaw, error: dayErr } = await supabase.rpc(
        "get_workout_day_full",
        { p_day_id: dayId } as any
      );
      if (cancelled) return;
      if (dayErr || !dayRaw) {
        toast.error(dayErr?.message ?? "Trening nije pronađen");
        setLoading(false);
        return;
      }
      const dayData = (Array.isArray(dayRaw) ? dayRaw[0] : dayRaw) as DayFull;
      if (!dayData || !dayData.exercises?.length) {
        toast.error("Ovaj dan nema vežbe");
        setDay(dayData ?? null);
        setLoading(false);
        return;
      }
      setDay(dayData);

      const { data: sid, error: startErr } = await supabase.rpc(
        "start_workout_session",
        {
          p_assigned_program_id: dayData.assigned_program_id,
          p_day_id: dayData.day_id,
        } as any
      );
      if (cancelled) return;
      if (startErr || !sid) {
        toast.error(startErr?.message ?? "Ne mogu da pokrenem trening");
        setLoading(false);
        return;
      }
      setSessionId(sid as unknown as string);
      const t = new Date();
      setStartedAt(t);
      setCurrentSetStartedAt(t);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [dayId, user]);

  /* ------------------------- Elapsed clock ------------------------- */
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  /* ------------------------- Wake lock ------------------------- */
  useEffect(() => {
    let released = false;
    const acquire = async () => {
      try {
        const anyNav = navigator as any;
        if (anyNav.wakeLock?.request) {
          const lock = await anyNav.wakeLock.request("screen");
          if (released) {
            lock.release?.();
            return;
          }
          wakeLockRef.current = lock;
        }
      } catch {
        /* noop */
      }
    };
    acquire();
    const onVis = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current) acquire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVis);
      wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
    };
  }, []);

  /* ------------------------- Live HR (push/subscribe) ------------------------- */
  useEffect(() => {
    if (!sessionId) return;

    let cleanup: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      const { startLiveHRMonitoring } = await import("@/lib/wearable/healthkit");
      if (cancelled) return;

      cleanup = await startLiveHRMonitoring((bpm) => {
        setLiveHr(bpm);
        hrSeriesRef.current.push({ ts: new Date().toISOString(), bpm });
      });
    })();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [sessionId]);

  /* ------------------------- Trainer messages (incoming) ------------------------- */
  type TrainerMessage = {
    id: string;
    message: string;
    message_type: "text" | "encouragement" | "warning" | string;
    sent_at: string;
  };
  const [incomingMessage, setIncomingMessage] = useState<TrainerMessage | null>(null);

  useEffect(() => {
    if (!user || !sessionId) return;
    const channel = supabase
      .channel(`live-msg:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "workout_live_messages",
          filter: `session_log_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (!row || row.athlete_id !== user.id) return;
          const msg: TrainerMessage = {
            id: row.id,
            message: row.message,
            message_type: row.message_type ?? "text",
            sent_at: row.sent_at ?? new Date().toISOString(),
          };
          setIncomingMessage(msg);
          triggerHaptic();
          // Mark as read
          supabase
            .from("workout_live_messages" as any)
            .update({ read_at: new Date().toISOString() } as any)
            .eq("id", row.id)
            .then(() => undefined);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, sessionId]);

  // Auto-dismiss banner after 8s
  useEffect(() => {
    if (!incomingMessage) return;
    const id = setTimeout(() => setIncomingMessage(null), 8000);
    return () => clearTimeout(id);
  }, [incomingMessage]);

  /* ------------------------- Live state heartbeat (every 15s) ------------------------- */
  const cleanupLiveStateRef = useRef(false);
  // Track current state ('active' | 'rest' | 'completed') driven by UI events
  const liveStateRef = useRef<"active" | "rest" | "completed">("active");

  useEffect(() => {
    if (!sessionId || !user || !day || !day.exercises?.length) return;
    let stopped = false;
    // NOTE: ne diramo liveStateRef ovde - njime upravljaju samo handleSetComplete / handleRestDone.
    // Heartbeat samo refleksuje trenutno stanje koje su handler-i postavili.
    const upsert = async () => {
      if (stopped) return;
      const ex = day.exercises[exerciseIdx];
      if (!ex) return;
      await supabase.from("workout_live_state" as any).upsert(
        {
          session_log_id: sessionId,
          athlete_id: user.id,
          current_exercise_idx: exerciseIdx,
          current_exercise_name: ex.exercise.name_en?.trim() || ex.exercise.name,
          current_set_number: setNumber,
          total_sets: ex.sets ?? null,
          current_hr: liveHr,
          current_state: liveStateRef.current,
          total_completed_sets: completedSets.length,
          last_heartbeat: new Date().toISOString(),
        } as any,
        { onConflict: "session_log_id" } as any,
      );
    };
    upsert();
    const id = setInterval(upsert, 15000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [sessionId, user, day, exerciseIdx, setNumber, liveHr, completedSets.length, resting]);

  // Cleanup on unmount: remove live state row
  useEffect(() => {
    return () => {
      if (sessionId && !cleanupLiveStateRef.current) {
        cleanupLiveStateRef.current = true;
        supabase
          .from("workout_live_state" as any)
          .delete()
          .eq("session_log_id", sessionId)
          .then(() => undefined);
      }
    };
  }, [sessionId]);


  /* ------------------------- Derived ------------------------- */
  const exercises = day?.exercises ?? [];
  const current = exercises[exerciseIdx];
  const totalSetsAll = useMemo(
    () => exercises.reduce((acc, e) => acc + (e.sets ?? 0), 0),
    [exercises]
  );
  const completedTotal = completedSets.length;
  const elapsedMs = startedAt ? now.getTime() - startedAt.getTime() : 0;

  const initialFor = (exIndex: number, setNum: number) => {
    const found = completedSets.find(
      (c) => c.exerciseIndex === exIndex && c.setNumber === setNum
    );
    return found ? { reps: found.reps, weight_kg: found.weight_kg } : null;
  };


  /* ------------------------- Handlers ------------------------- */
  const handleSetComplete = useCallback(
    async (data: { reps: number; weight_kg: number; rpe: number | null; notes: string | null }) => {
      if (!current || !sessionId) return;
      const nowTs = new Date();
      const restEst = Math.max(
        0,
        Math.round((nowTs.getTime() - currentSetStartedAt.getTime()) / 1000)
      );

      const { error } = await supabase.from("set_logs").insert({
        session_log_id: sessionId,
        exercise_id: current.id,
        set_number: setNumber,
        reps: data.reps,
        weight_kg: data.weight_kg,
        rpe: data.rpe,
        notes: data.notes,
        done: true,
        started_at: currentSetStartedAt.toISOString(),
        completed_at: nowTs.toISOString(),
        actual_rest_seconds: restEst,
      } as any);

      if (error) {
        toast.error(error.message);
        return;
      }

      triggerHaptic();

      setCompletedSets((prev) => {
        const without = prev.filter(
          (c) => !(c.exerciseIndex === exerciseIdx && c.setNumber === setNumber)
        );
        return [
          ...without,
          {
            exerciseIndex: exerciseIdx,
            setNumber,
            reps: data.reps,
            weight_kg: data.weight_kg,
          },
        ];
      });

      // Decide next state
      const isLastSetOfExercise = setNumber >= current.sets;
      const isLastExercise = exerciseIdx >= exercises.length - 1;

      if (isLastSetOfExercise && isLastExercise) {
        liveStateRef.current = "completed";
        if (user) {
          await supabase.from("workout_live_state" as any).upsert(
            {
              session_log_id: sessionId,
              athlete_id: user.id,
              current_exercise_idx: exerciseIdx,
              current_exercise_name: current.exercise.name_en?.trim() || current.exercise.name,
              current_set_number: setNumber,
              total_sets: current.sets ?? null,
              current_hr: liveHr,
              current_state: "completed",
              total_completed_sets: completedSets.length + 1,
              last_heartbeat: new Date().toISOString(),
            } as any,
            { onConflict: "session_log_id" } as any,
          );
        }
        await finishWorkout();
        return;
      }

      const restSec = current.rest_seconds && current.rest_seconds > 0
        ? current.rest_seconds
        : 60;

      const nextEx = exercises[exerciseIdx + 1]?.exercise;
      const nextName = nextEx ? (nextEx.name_en?.trim() || nextEx.name) : "";
      const nextSubtitle = isLastSetOfExercise
        ? `Sledeća vežba: ${nextName}`
        : `Sledeća serija ${setNumber + 1} od ${current.sets}`;

      // Mark as resting in live state for watch app.
      // Ako je poslednji set ove vezbe -> u upsert idu podaci SLEDECE vezbe (idx+1, set 1, njen total_sets).
      // Ako nije poslednji set -> ostaje ista vezba, samo current_set_number = setNumber + 1.
      liveStateRef.current = "rest";
      if (user) {
        const nextExerciseRow = isLastSetOfExercise ? exercises[exerciseIdx + 1] : current;
        const nextIdx = isLastSetOfExercise ? exerciseIdx + 1 : exerciseIdx;
        const nextSetNum = isLastSetOfExercise ? 1 : setNumber + 1;
        const nextTotalSets = nextExerciseRow?.sets ?? null;
        const nextDisplayName = nextExerciseRow
          ? (nextExerciseRow.exercise.name_en?.trim() || nextExerciseRow.exercise.name)
          : (current.exercise.name_en?.trim() || current.exercise.name);

        await supabase.from("workout_live_state" as any).upsert(
          {
            session_log_id: sessionId,
            athlete_id: user.id,
            current_exercise_idx: nextIdx,
            current_exercise_name: nextDisplayName,
            current_set_number: nextSetNum,
            total_sets: nextTotalSets,
            current_hr: liveHr,
            current_state: "rest",
            total_completed_sets: completedSets.length + 1,
            last_heartbeat: new Date().toISOString(),
          } as any,
          { onConflict: "session_log_id" } as any,
        );
      }

      setResting({ seconds: restSec, subtitle: nextSubtitle });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, sessionId, setNumber, currentSetStartedAt, exerciseIdx, exercises]
  );

  const finishWorkout = useCallback(async () => {
    if (!sessionId || finishing) return;
    setFinishing(true);
    const series = hrSeriesRef.current;
    const bpms = series.map((p) => p.bpm).filter((n) => Number.isFinite(n));
    const avg = bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : null;
    const max = bpms.length ? Math.max(...bpms) : null;
    const min = bpms.length ? Math.min(...bpms) : null;

    const { error } = await supabase.rpc("complete_workout_session", {
      p_session_id: sessionId,
      p_hr_avg: avg,
      p_hr_max: max,
      p_hr_min: min,
      p_active_calories: null,
      p_hr_series: series.length ? (series as any) : null,
    } as any);

    setFinishing(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    cleanupLiveStateRef.current = true;
    await supabase.from("workout_live_state" as any).delete().eq("session_log_id", sessionId);
    nav(`/vezbac/trening/zavrsen/${sessionId}`, { replace: true });
  }, [sessionId, finishing, nav]);

  const handleRestDone = () => {
    setResting(null);
    if (!current) return;
    // Back to active state for watch app
    liveStateRef.current = "active";
    if (sessionId && user) {
      supabase
        .from("workout_live_state" as any)
        .upsert(
          {
            session_log_id: sessionId,
            athlete_id: user.id,
            current_exercise_idx: exerciseIdx,
            current_exercise_name: current.exercise.name_en?.trim() || current.exercise.name,
            current_set_number: setNumber,
            total_sets: current.sets ?? null,
            current_hr: liveHr,
            current_state: "active",
            total_completed_sets: completedSets.length,
            last_heartbeat: new Date().toISOString(),
          } as any,
          { onConflict: "session_log_id" } as any,
        )
        .then(() => undefined);
    }
    if (setNumber >= current.sets) {
      // advance to next exercise
      if (exerciseIdx < exercises.length - 1) {
        setExerciseIdx((i) => i + 1);
        setSetNumber(1);
      }
    } else {
      setSetNumber((s) => s + 1);
    }
    setCurrentSetStartedAt(new Date());
  };

  const confirmCancel = async () => {
    if (sessionId) {
      await supabase.rpc("cancel_workout_session", { p_session_id: sessionId } as any);
      cleanupLiveStateRef.current = true;
      await supabase.from("workout_live_state" as any).delete().eq("session_log_id", sessionId);
    }
    setCloseOpen(false);
    nav("/vezbac");
  };

  /* ------------------------- Render ------------------------- */
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!day || !current) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6 text-center">
        <div className="space-y-3">
          <p className="text-muted-foreground">Trening nije dostupan.</p>
          <button
            onClick={() => nav("/vezbac")}
            className="text-primary font-semibold"
          >
            Nazad
          </button>
        </div>
      </div>
    );
  }

  const setsForCurrent = current.sets;
  const setsList = Array.from({ length: setsForCurrent }, (_, i) => i + 1);
  const progressPct = totalSetsAll > 0 ? (completedTotal / totalSetsAll) * 100 : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[440px] min-h-screen relative pb-10">
        {/* Top bar */}
        <div
          className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-hairline"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 20px) + 8px)" }}
        >
          <div className="px-4 pb-3 flex items-center gap-3">
            <button
              onClick={() => setCloseOpen(true)}
              aria-label="Zatvori"
              className="h-10 w-10 rounded-full bg-surface border border-hairline flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Aktivan trening · {fmtElapsed(elapsedMs)}
              </div>
              <div className="text-[13px] font-bold text-foreground truncate">
                Vežba {exerciseIdx + 1} od {exercises.length} · Serija {setNumber} od {setsForCurrent}
              </div>
            </div>
            <div
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-surface border border-hairline shrink-0"
              style={{ color: liveHr && liveHr > 0 ? getHrColor(liveHr) : undefined }}
              aria-label="Trenutni puls"
            >
              <Heart
                className={cn("h-3.5 w-3.5", liveHr && liveHr > 0 && "animate-pulse")}
                strokeWidth={2.4}
                fill={liveHr && liveHr > 0 ? "currentColor" : "none"}
              />
              <span className="text-[13px] font-bold tnum leading-none">
                {liveHr && liveHr > 0 ? liveHr : "-"}
              </span>
            </div>
          </div>
          <div className="h-1 bg-surface-2">
            <div
              className="h-full bg-gradient-brand transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {incomingMessage && (
          <div className="px-4 pt-3">
            <div
              className={cn(
                "rounded-2xl border px-4 py-3 flex items-start gap-3 shadow-xs animate-fade-in",
                incomingMessage.message_type === "warning" &&
                  "bg-destructive-soft border-destructive/30 text-destructive-soft-foreground",
                incomingMessage.message_type === "encouragement" &&
                  "bg-success-soft border-success/30 text-success-soft-foreground",
                incomingMessage.message_type !== "warning" &&
                  incomingMessage.message_type !== "encouragement" &&
                  "bg-primary-soft border-primary/30 text-primary-soft-foreground",
              )}
              role="status"
              aria-live="polite"
            >
              <div className="h-9 w-9 rounded-full bg-gradient-brand text-white inline-flex items-center justify-center shrink-0">
                <MessageCircle className="h-4 w-4" strokeWidth={2.4} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-80">
                  Trener:
                </div>
                <div className="text-[14px] font-semibold leading-snug mt-0.5">
                  {incomingMessage.message}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIncomingMessage(null)}
                aria-label="Zatvori"
                className="h-7 w-7 rounded-full inline-flex items-center justify-center hover:bg-black/5 transition active:scale-95"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <div className="px-4 pt-4 space-y-5">
          <ExerciseHeader
            name={current.exercise.name}
            nameEn={current.exercise.name_en}
            primaryMuscle={current.exercise.primary_muscle}
            thumbnailUrl={current.exercise.thumbnail_url}
            videoUrl={current.exercise.video_url}
            instructions={current.exercise.instructions}
          />

          {/* Target stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-surface border border-hairline p-3 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Serije
              </div>
              <div className="font-display text-[22px] font-bold tracking-tightest tnum mt-0.5">
                {Math.min(setNumber, setsForCurrent)}
                <span className="text-muted-foreground">/{setsForCurrent}</span>
              </div>
            </div>
            <div className="rounded-2xl bg-surface border border-hairline p-3 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Cilj reps
              </div>
              <div className="font-display text-[22px] font-bold tracking-tightest tnum mt-0.5">
                {current.reps ?? "—"}
              </div>
            </div>
            <div className="rounded-2xl bg-surface border border-hairline p-3 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Cilj kg
              </div>
              <div className="font-display text-[22px] font-bold tracking-tightest tnum mt-0.5">
                {current.weight_kg ?? "—"}
              </div>
            </div>
          </div>

          {/* Sets list */}
          <div className="rounded-3xl bg-surface border border-hairline overflow-hidden">
            {setsList.map((n) => {
              const done = completedSets.some(
                (c) => c.exerciseIndex === exerciseIdx && c.setNumber === n
              );
              const active = n === setNumber && !done;
              const completed = completedSets.find(
                (c) => c.exerciseIndex === exerciseIdx && c.setNumber === n
              );
              return (
                <div
                  key={n}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 border-b border-hairline last:border-b-0",
                    active && "bg-primary-soft/30"
                  )}
                >
                  <div
                    className={cn(
                      "h-7 w-7 rounded-full flex items-center justify-center text-[12px] font-bold tnum",
                      done
                        ? "bg-success text-white"
                        : active
                          ? "bg-gradient-brand text-white"
                          : "bg-surface-2 text-muted-foreground"
                    )}
                  >
                    {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
                  </div>
                  <div className="flex-1 text-[13px]">
                    <span className="font-semibold text-foreground">Serija {n}</span>
                    {completed ? (
                      <span className="text-muted-foreground">
                        {" · "}
                        {completed.reps} reps · {completed.weight_kg} kg
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {" · cilj "}
                        {current.reps ?? "—"} × {current.weight_kg ?? "—"} kg
                      </span>
                    )}
                  </div>
                  {active && <ChevronRight className="h-4 w-4 text-primary" />}
                </div>
              );
            })}
          </div>

          {/* Active set logger */}
          <SetLogger
            key={`${exerciseIdx}-${setNumber}`}
            setNumber={setNumber}
            totalSets={setsForCurrent}
            targetReps={current.reps}
            targetWeightKg={current.weight_kg}
            initialReps={initialFor(exerciseIdx, setNumber)?.reps ?? null}
            initialWeightKg={initialFor(exerciseIdx, setNumber)?.weight_kg ?? null}
            onComplete={handleSetComplete}
          />

          {/* Manual finish */}
          <button
            type="button"
            onClick={() => finishWorkout()}
            disabled={finishing}
            className="w-full text-[12px] font-semibold text-muted-foreground py-3 disabled:opacity-50"
          >
            {finishing ? "Završavam..." : "Završi trening odmah"}
          </button>
        </div>
      </div>

      {resting && (
        <RestTimer
          targetSeconds={resting.seconds}
          subtitle={resting.subtitle}
          onDone={handleRestDone}
        />
      )}

      <AlertDialog open={closeOpen} onOpenChange={setCloseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Prekini trening?</AlertDialogTitle>
            <AlertDialogDescription>
              Da li želiš da prekineš trening? Sav napredak će biti izgubljen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel}>Da, prekini</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ActiveWorkout;
