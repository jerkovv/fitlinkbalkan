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
  id: string;
  position: number;
  sets: number;
  reps: number | null;
  weight_kg: number | null;
  rest_seconds: number | null;
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

// Pozicija treninga = JEDINI izvor istine za prikaz. Dolazi iz athlete_poll_state
// (server motor). Telefon je ČITAČ: ne upisuje poziciju, samo zove engine RPC-ove
// i renderuje ono što server vrati. Optimistički lokalni prikaz je samo radi
// brzine; poll je korektor.
type WorkoutPos = {
  exerciseIdx: number;
  setNumber: number;
  totalSets: number;
  state: "active" | "rest" | "completed";
  // Apsolutni kraj odmora u KLIJENTSKOM epoch ms (server-abs umanjen za clock offset).
  restEndsAtMs: number | null;
  // Početak treninga, SERVER epoch ms. Proteklo vreme se računa od servera, ne lokalno.
  startedAtMs: number | null;
  currentHr: number | null;
};

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
  const [now, setNow] = useState<Date>(new Date());

  // Pozicija iz servera (poll). null dok prvi poll ne stigne.
  const [pos, setPos] = useState<WorkoutPos | null>(null);

  // Lokalni log serija — SAMO za labele u listi serija (best-effort, optimistički).
  // NIJE izvor pozicije; markeri "urađeno" se izvode iz pos.setNumber.
  const [completedSets, setCompletedSets] = useState<CompletedSet[]>([]);
  const [finishing, setFinishing] = useState(false);
  // Kraj treninga (finish/poslednji set/cancel). Kad je true: poll i heartbeat se
  // GASE (effect teardown), i init NE sme više da zove start_workout_session.
  const [finished, setFinished] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  // Live HR (lokalni HealthKit stream na telefonu)
  const [liveHr, setLiveHr] = useState<number | null>(null);
  const hrSeriesRef = useRef<HRPoint[]>([]);

  // Wake lock
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // --- Reader plumbing ---
  // Clock offset = server_now_ms - client Date.now(). Primenjuje se na rest_ends_at_ms
  // da skew sata uređaja ne pokvari preostalo vreme.
  const clockOffsetRef = useRef(0);
  // Staleness brana: ako optimistička akcija krene POSLE nego što je poll započeo,
  // odgovor tog poll-a se odbacuje (ne sme da vrati prikaz na staro server stanje).
  const lastActionAtRef = useRef(0);
  // Da li smo ikad videli živ trening (da null poll na startu ne odvede u "završeno").
  const sawWorkoutRef = useRef(false);
  // Štit: kad smo već krenuli na "završeno", ignoriši poll i ne navigiraj dvaput.
  const finishedRef = useRef(false);
  // Init guard: start_workout_session sme TAČNO jednom po ulasku u ekran. Sprečava
  // dupli start na re-render/dep promenu (npr. nova referenca user-a).
  const initRef = useRef(false);
  // Da posle unmount-a ne diramo state iz in-flight init-a.
  const unmountedRef = useRef(false);
  // Ref na poziciju za stabilne handlere (watch eventi).
  const posRef = useRef<WorkoutPos | null>(null);
  useEffect(() => { posRef.current = pos; }, [pos]);

  // Jedinstveni prelaz u "završeno": sinhroni ref (za async zatvaranja) + state
  // (da poll/heartbeat effekti urade teardown i prestanu da rade ODMAH).
  const markFinished = useCallback(() => {
    finishedRef.current = true;
    setFinished(true);
  }, []);

  useEffect(() => {
    return () => { unmountedRef.current = true; };
  }, []);

  // Ref na sessionId za async provere (resume/poll) bez zavisnosti u callback-ovima.
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // Ako je sesija vec zatvorena na serveru (npr. zavrsena na satu dok je telefon
  // spavao/ubijen), idi pravo na rezime umesto da visimo na ekranu treninga.
  const navIfSessionDone = useCallback(async (sid: string | null): Promise<boolean> => {
    if (!sid || finishedRef.current) return false;
    // Samo ako smo videli zivu sesiju (vezbac je bio u toku treninga). Inace bi
    // staru zavrsenu sesiju bacalo na rezime cim vezbac udje da je ponovo odradi.
    if (!sawWorkoutRef.current) return false;
    const { data } = await supabase
      .from("workout_session_logs")
      .select("is_active")
      .eq("id", sid)
      .maybeSingle();
    if (unmountedRef.current) return false;
    if (data && (data as any).is_active === false) {
      markFinished();
      nav(`/vezbac/trening/zavrsen/${sid}`, { replace: true });
      return true;
    }
    return false;
  }, [nav, markFinished]);

  /* ------------------------- Init: start session + load day ------------------------- */
  useEffect(() => {
    if (!dayId || !user) return;
    // TAČNO jednom: nikad ponovo na re-render, dep promenu, ni posle završetka.
    if (initRef.current || finishedRef.current) return;
    initRef.current = true;

    (async () => {
      setLoading(true);

      const { data: dayRaw, error: dayErr } = await supabase.rpc(
        "get_workout_day_full",
        { p_day_id: dayId } as any
      );
      if (unmountedRef.current) return;
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

      // start_workout_session sam resava: ako za ovaj dan postoji ZIVA sesija ->
      // vrati je (resume + re-seed zivog reda); inace pokrene NOVU. Klik na dan =
      // nov trening cak i za vec zavrsen dan. NE navigiramo na rezime na osnovu
      // stare zavrsene sesije (to je ranije gresno bacalo na rezime).
      // Takodje seed-uje pocetni zivi red, pa prvi athlete_poll_state vraca trening.
      const { data: sid, error: startErr } = await supabase.rpc(
        "start_workout_session",
        {
          p_assigned_program_id: dayData.assigned_program_id,
          p_day_id: dayData.day_id,
        } as any
      );
      if (unmountedRef.current) return;
      if (startErr || !sid) {
        toast.error(startErr?.message ?? "Ne mogu da pokrenem trening");
        setLoading(false);
        return;
      }
      setSessionId(sid as unknown as string);
      setLoading(false);
    })();
  }, [dayId, user]);

  /* ------------------------- Elapsed clock (tick; vreme se računa od servera) ------------------------- */
  useEffect(() => {
    if (!sessionId) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [sessionId]);

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

  /* ------------------------- Derived ------------------------- */
  const exercises = day?.exercises ?? [];
  const current = pos ? exercises[pos.exerciseIdx] : undefined;
  const totalSetsAll = useMemo(
    () => exercises.reduce((acc, e) => acc + (e.sets ?? 0), 0),
    [exercises]
  );
  // Ukupno urađenih serija = sve serije vežbi pre tekuće + (setNumber - 1) tekuće.
  const completedTotal = useMemo(() => {
    if (!pos || !day) return 0;
    let sum = 0;
    for (let i = 0; i < pos.exerciseIdx; i++) sum += day.exercises[i]?.sets ?? 0;
    sum += Math.max(0, pos.setNumber - 1);
    return sum;
  }, [pos, day]);
  // Proteklo vreme se računa od SERVERA: serverNow (= now + clockOffset) − started_at_ms.
  // Bez lokalnog startedAt-a, pa remount/otključavanje ne resetuje brojač.
  const elapsedMs = pos?.startedAtMs
    ? Math.max(0, now.getTime() + clockOffsetRef.current - pos.startedAtMs)
    : 0;

  const initialFor = (exIndex: number, setNum: number) => {
    const found = completedSets.find(
      (c) => c.exerciseIndex === exIndex && c.setNumber === setNum
    );
    return found ? { reps: found.reps, weight_kg: found.weight_kg } : null;
  };

  /* ------------------------- Finalizacija (HR statistika + nav) ------------------------- */
  // Engine (athlete_complete_set zadnje serije / athlete_finish_workout) već zatvara
  // sesiju i živi red na serveru. Ovde SAMO zakačimo HR statistiku (avg/max/series)
  // koju motor ne računa, pa navigiramo. complete_workout_session je idempotentan.
  const finalizeAndNav = useCallback(async () => {
    if (!sessionId) return;
    const series = hrSeriesRef.current;
    const bpms = series.map((p) => p.bpm).filter((n) => Number.isFinite(n));
    const avg = bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : null;
    const max = bpms.length ? Math.max(...bpms) : null;
    const min = bpms.length ? Math.min(...bpms) : null;

    try {
      await supabase.rpc("complete_workout_session", {
        p_session_id: sessionId,
        p_hr_avg: avg,
        p_hr_max: max,
        p_hr_min: min,
        p_active_calories: null,
        p_hr_series: series.length ? (series as any) : null,
      } as any);
    } catch {
      /* sesija je možda već zatvorena drugde — svejedno idemo na ekran rezultata */
    }
    nav(`/vezbac/trening/zavrsen/${sessionId}`, { replace: true });
  }, [sessionId, nav]);

  /* ------------------------- Poll: athlete_poll_state (render iz servera) ------------------------- */
  const applyPoll = useCallback(
    (workout: any, serverNowMs: number | null | undefined) => {
      if (finishedRef.current) return;
      if (typeof serverNowMs === "number") {
        clockOffsetRef.current = serverNowMs - Date.now();
      }

      if (!workout) {
        // Nema živog reda. Navigiraj na rezime SAMO ako smo videli živu sesiju
        // (završena DOK je vežbač u ActiveWorkout - ovde ili na satu). Ako još
        // nismo videli živu (vežbač tek ušao / seed nije stigao), NE navigiraj na
        // rezime - pusti normalan tok (init je pokrenuo novu sesiju).
        if (sawWorkoutRef.current) {
          markFinished();
          void finalizeAndNav();
        }
        return;
      }

      sawWorkoutRef.current = true;

      const serverRestMs =
        typeof workout.rest_ends_at_ms === "number" ? workout.rest_ends_at_ms : null;
      const restEndsAtMs =
        serverRestMs != null ? serverRestMs - clockOffsetRef.current : null;

      setPos({
        exerciseIdx: workout.current_exercise_idx ?? 0,
        setNumber: workout.current_set_number ?? 1,
        totalSets: workout.total_sets ?? 1,
        state: (workout.current_state as WorkoutPos["state"]) ?? "active",
        restEndsAtMs,
        startedAtMs:
          typeof workout.started_at_ms === "number" ? workout.started_at_ms : null,
        currentHr: typeof workout.current_hr === "number" ? workout.current_hr : null,
      });
    },
    [finalizeAndNav, markFinished]
  );

  useEffect(() => {
    if (!sessionId || finished) return;
    let stopped = false;

    const poll = async () => {
      if (finishedRef.current) return;
      const startedTs = Date.now();
      const { data, error } = await supabase.rpc("athlete_poll_state");
      if (stopped) return;
      if (error) return; // zadrži poslednje stanje
      // Staleness: novija optimistička akcija je krenula POSLE starta ovog poll-a.
      if (lastActionAtRef.current > startedTs) return;
      const res = data as any;
      if (!res || res.success === false) return;
      applyPoll(res.workout, res.server_now_ms);
    };

    poll();
    const id = setInterval(poll, 2000);
    const onVis = () => {
      // Na povratak u foreground: prvo proveri da li je sesija zatvorena (npr.
      // zavrsena na satu dok je telefon spavao) -> rezime; pa onda poll.
      if (document.visibilityState === "visible") {
        void navIfSessionDone(sessionIdRef.current).then((done) => {
          if (!done) poll();
        });
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [sessionId, finished, applyPoll, navIfSessionDone]);

  /* ------------------------- Heartbeat: athlete_heartbeat (samo HR + svežina) ------------------------- */
  // Dira SAMO last_heartbeat i current_hr — nikad poziciju. Drži živi red svežim
  // (poll filtrira last_heartbeat > now - 5min).
  useEffect(() => {
    if (!sessionId || finished) return;
    let stopped = false;
    const beat = async () => {
      if (stopped || finishedRef.current) return;
      try {
        await supabase.rpc("athlete_heartbeat", {
          p_session_id: sessionId,
          p_hr: liveHr ?? null,
        } as any);
      } catch {
        /* noop */
      }
    };
    beat();
    const id = setInterval(beat, 12000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [sessionId, liveHr, finished]);

  /* ------------------------- Helper: produži odmor (+30 kroz motor) ------------------------- */
  const handleAddRest = useCallback(
    async (extraSeconds: number) => {
      const p = posRef.current;
      if (!sessionId || !p || !p.restEndsAtMs) return;

      // Optimistički bump prikaza; poll uskladi sa serverskim rest_ends_at.
      const newClientEnd = p.restEndsAtMs + extraSeconds * 1000;
      lastActionAtRef.current = Date.now();
      setPos((prev) => (prev ? { ...prev, restEndsAtMs: newClientEnd } : prev));

      // +30 ide u motor (athlete_extend_rest doda sekunde samo ako je state rest),
      // isti izvor istine kao sat. Nema više direktnog upisa rest_ends_at.
      const { error } = await supabase.rpc("athlete_extend_rest", {
        p_session_id: sessionId,
        p_seconds: extraSeconds,
      } as any);
      lastActionAtRef.current = Date.now();
      if (error) toast.error(error.message);
    },
    [sessionId]
  );

  /* ------------------------- Handlers (dugmad -> engine RPC, optimistički prikaz) ------------------------- */
  const handleSetComplete = useCallback(
    async (data: { reps: number; weight_kg: number; rpe: number | null; notes: string | null }) => {
      const p = posRef.current;
      if (!sessionId || !p || !day) return;
      triggerHaptic();

      const ex = day.exercises[p.exerciseIdx];
      const isLastSet = p.setNumber >= (ex?.sets ?? p.totalSets);
      const isLastExercise = p.exerciseIdx >= day.exercises.length - 1;
      const isWorkoutDone = isLastSet && isLastExercise;

      // Optimistički log za labele (best-effort)
      setCompletedSets((prev) => [
        ...prev.filter(
          (c) => !(c.exerciseIndex === p.exerciseIdx && c.setNumber === p.setNumber)
        ),
        {
          exerciseIndex: p.exerciseIdx,
          setNumber: p.setNumber,
          reps: data.reps,
          weight_kg: data.weight_kg,
        },
      ]);

      lastActionAtRef.current = Date.now();

      if (isWorkoutDone) {
        // Zadnja serija: athlete_complete_set LOGUJE seriju I finalizuje sesiju.
        // markFinished ODMAH gasi poll i heartbeat, da posle kraja ništa ne ostane živo.
        setFinishing(true);
        markFinished();
        const { error } = await supabase.rpc("athlete_complete_set", {
          p_session_id: sessionId,
          p_reps: data.reps,
          p_weight: data.weight_kg,
          p_rpe: data.rpe,
        } as any);
        if (error) {
          toast.error(error.message);
          finishedRef.current = false;
          setFinished(false);
          setFinishing(false);
          return;
        }
        await finalizeAndNav();
        setFinishing(false);
        return;
      }

      // Optimistički: uđi u odmor sa predviđenom sledećom pozicijom; poll koriguje.
      const restSec = ex?.rest_seconds && ex.rest_seconds > 0 ? ex.rest_seconds : 60;
      const nextIdx = isLastSet ? p.exerciseIdx + 1 : p.exerciseIdx;
      const nextSet = isLastSet ? 1 : p.setNumber + 1;
      const nextEx = day.exercises[nextIdx];
      // Kraj odmora računamo kao serverNow + trajanje (serverNow = Date.now + offset),
      // pa vratimo u KLIJENT epohu (kao i poll: serverRestMs - offset). Tako se
      // optimistički kraj poklopi sa serverskim i nema skoka kad poll stigne.
      const serverNowMs = Date.now() + clockOffsetRef.current;
      const serverRestEndMs = serverNowMs + restSec * 1000;
      setPos({
        exerciseIdx: nextIdx,
        setNumber: nextSet,
        totalSets: nextEx?.sets ?? p.totalSets,
        state: "rest",
        restEndsAtMs: serverRestEndMs - clockOffsetRef.current,
        startedAtMs: p.startedAtMs,
        currentHr: p.currentHr,
      });

      const { error } = await supabase.rpc("athlete_complete_set", {
        p_session_id: sessionId,
        p_reps: data.reps,
        p_weight: data.weight_kg,
        p_rpe: data.rpe,
      } as any);
      lastActionAtRef.current = Date.now();
      if (error) toast.error(error.message);
    },
    [sessionId, day, finalizeAndNav, markFinished]
  );

  const skipRest = useCallback(async () => {
    const p = posRef.current;
    if (!sessionId || !p) return;
    lastActionAtRef.current = Date.now();
    setPos((prev) => (prev ? { ...prev, state: "active", restEndsAtMs: null } : prev));
    const { error } = await supabase.rpc("athlete_skip_rest", {
      p_session_id: sessionId,
    } as any);
    lastActionAtRef.current = Date.now();
    if (error) toast.error(error.message);
  }, [sessionId]);

  const finishWorkout = useCallback(async () => {
    if (!sessionId || finishing || finishedRef.current) return;
    setFinishing(true);
    markFinished();
    lastActionAtRef.current = Date.now();
    const { error } = await supabase.rpc("athlete_finish_workout", {
      p_session_id: sessionId,
    } as any);
    if (error) {
      toast.error(error.message);
      finishedRef.current = false;
      setFinished(false);
      setFinishing(false);
      return;
    }
    await finalizeAndNav();
    setFinishing(false);
  }, [sessionId, finishing, finalizeAndNav, markFinished]);

  const confirmCancel = async () => {
    markFinished();
    if (sessionId) {
      await supabase.rpc("cancel_workout_session", { p_session_id: sessionId } as any);
      await supabase.from("workout_live_state" as any).delete().eq("session_log_id", sessionId);
    }
    setCloseOpen(false);
    nav("/vezbac");
  };

  /* ------------------------- Render ------------------------- */
  if (loading || !pos) {
    return (
      <div className="h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!day || !current) {
    return (
      <div className="h-[100dvh] bg-background flex items-center justify-center px-6 text-center">
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

  const exerciseIdx = pos.exerciseIdx;
  const setNumber = pos.setNumber;
  const setsForCurrent = current.sets;
  const setsList = Array.from({ length: setsForCurrent }, (_, i) => i + 1);
  const progressPct = totalSetsAll > 0 ? (completedTotal / totalSetsAll) * 100 : 0;
  const hr = liveHr ?? pos.currentHr;
  const isResting = pos.state === "rest" && pos.restEndsAtMs != null;
  const restSubtitle =
    setNumber <= 1
      ? `Sledeća vežba: ${current.exercise.name_en?.trim() || current.exercise.name}`
      : `Sledeća serija ${setNumber} od ${setsForCurrent}`;

  return (
    <div className="h-[100dvh] overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-[440px] min-h-screen relative pb-10">
        {/* Top bar */}
        <div
          className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-hairline"
          style={{ paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 8px)" }}
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
                Aktivan trening{pos.startedAtMs ? ` · ${fmtElapsed(elapsedMs)}` : ""}
              </div>
              <div className="text-[13px] font-bold text-foreground truncate">
                Vežba {exerciseIdx + 1} od {exercises.length} · Serija {setNumber} od {setsForCurrent}
              </div>
            </div>
            <div
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-surface border border-hairline shrink-0"
              style={{ color: hr && hr > 0 ? getHrColor(hr) : undefined }}
              aria-label="Trenutni puls"
            >
              <Heart
                className={cn("h-3.5 w-3.5", hr && hr > 0 && "animate-pulse")}
                strokeWidth={2.4}
                fill={hr && hr > 0 ? "currentColor" : "none"}
              />
              <span className="text-[13px] font-bold tnum leading-none">
                {hr && hr > 0 ? hr : "-"}
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
                {current.reps ?? "-"}
              </div>
            </div>
            <div className="rounded-2xl bg-surface border border-hairline p-3 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Cilj kg
              </div>
              <div className="font-display text-[22px] font-bold tracking-tightest tnum mt-0.5">
                {current.weight_kg ?? "-"}
              </div>
            </div>
          </div>

          {/* Sets list */}
          <div className="rounded-3xl bg-surface border border-hairline overflow-hidden">
            {setsList.map((n) => {
              // Markeri "urađeno" se izvode iz pozicije (server), ne iz lokalnog loga.
              const done = n < setNumber;
              const active = n === setNumber && pos.state === "active";
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
                        {current.reps ?? "-"} × {current.weight_kg ?? "-"} kg
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

      {isResting && pos.restEndsAtMs != null && (
        <RestTimer
          endsAt={pos.restEndsAtMs}
          subtitle={restSubtitle}
          onDone={skipRest}
          onAddSeconds={handleAddRest}
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
