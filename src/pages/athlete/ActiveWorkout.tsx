import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Button, Card, Chip } from "@/components/ui-bits";
import { Check, Loader2, ChevronLeft, ChevronRight, RotateCcw, Trophy, HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type DayInfo = {
  id: string;
  day_number: number;
  name: string;
  assigned_program_id: string;
};

type ProgramExercise = {
  id: string;
  position: number;
  sets: number;
  reps: string | null;
  weight_kg: number | null;
  rest_seconds: number | null;
  exercise_id: string;
  exercises: { name: string; primary_muscle: string | null } | null;
};

type SetEntry = {
  set_number: number;
  reps: string;
  weight_kg: string;
  rpe: string;
  done: boolean;
  log_id?: string;
};

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

const ActiveWorkout = () => {
  const { dayId } = useParams<{ dayId: string }>();
  const { user } = useAuth();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState<DayInfo | null>(null);
  const [exercises, setExercises] = useState<ProgramExercise[]>([]);
  const [sessionLogId, setSessionLogId] = useState<string | null>(null);
  const [setsByEx, setSetsByEx] = useState<Record<string, SetEntry[]>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [alreadyDoneToday, setAlreadyDoneToday] = useState<{ open: boolean; completedAt: string | null }>({
    open: false,
    completedAt: null,
  });
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // Rest timer
  const [rest, setRest] = useState(0);
  const [restTotal, setRestTotal] = useState(60);

  useEffect(() => {
    if (rest <= 0) return;
    const t = setInterval(() => setRest((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [rest]);

  // Init: učitaj dan + vežbe + kreiraj session log
  useEffect(() => {
    if (!dayId || !user) return;
    const init = async () => {
      setLoading(true);

      const { data: dayData, error: dayErr } = await supabase
        .from("assigned_program_days")
        .select("id, day_number, name, assigned_program_id")
        .eq("id", dayId)
        .maybeSingle();

      if (dayErr || !dayData) {
        toast.error("Trening nije pronađen");
        setLoading(false);
        return;
      }
      setDay(dayData as DayInfo);

      const { data: exData } = await supabase
        .from("assigned_program_exercises")
        .select("id, position, sets, reps, weight_kg, rest_seconds, exercise_id, exercises(name, primary_muscle)")
        .eq("day_id", dayId)
        .order("position", { ascending: true });

      const exList = ((exData as any[]) ?? []) as ProgramExercise[];
      setExercises(exList);

      // Inicijalizuj prazne setove (ili učitaj već započete u sesiji ako postoji nedovršena)
      const { data: existing } = await supabase
        .from("workout_session_logs")
        .select("id")
        .eq("athlete_id", user.id)
        .eq("day_id", dayId)
        .is("completed_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Provera: da li je ovaj dan već završen DANAS?
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { data: doneToday } = await supabase
        .from("workout_session_logs")
        .select("id, completed_at")
        .eq("athlete_id", user.id)
        .eq("day_id", dayId)
        .not("completed_at", "is", null)
        .gte("completed_at", startOfDay.toISOString())
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (doneToday && !existing) {
        setAlreadyDoneToday({ open: true, completedAt: (doneToday as any).completed_at });
      }

      let sid: string;
      if (existing) {
        sid = (existing as any).id;
      } else {
        const { data: created, error: cErr } = await supabase
          .from("workout_session_logs")
          .insert({
            athlete_id: user.id,
            assigned_program_id: (dayData as DayInfo).assigned_program_id,
            day_id: dayId,
            day_number: (dayData as DayInfo).day_number,
          } as any)
          .select("id")
          .single();
        if (cErr) {
          toast.error(cErr.message);
          setLoading(false);
          return;
        }
        sid = (created as any).id;
      }
      setSessionLogId(sid);

      // Učitaj postojeće set logove
      const { data: prevLogs } = await supabase
        .from("set_logs")
        .select("id, exercise_id, set_number, reps, weight_kg, rpe, done")
        .eq("session_log_id", sid);

      const map: Record<string, SetEntry[]> = {};
      for (const ex of exList) {
        const arr: SetEntry[] = [];
        // Prefill iz trenerovog plana: reps i weight_kg postaju default vrednosti
        // koje vežbač samo potvrdi (ili izmeni pa potvrdi).
        const planReps = ex.reps ? String(parseInt(ex.reps, 10) || ex.reps) : "";
        const planWeight = ex.weight_kg != null ? String(ex.weight_kg) : "";
        for (let i = 1; i <= ex.sets; i++) {
          const found = (prevLogs as any[])?.find(
            (l) => l.exercise_id === ex.id && l.set_number === i
          );
          arr.push({
            set_number: i,
            reps: found?.reps?.toString() ?? planReps,
            weight_kg: found?.weight_kg?.toString() ?? planWeight,
            rpe: found?.rpe?.toString() ?? "",
            done: !!found?.done,
            log_id: found?.id,
          });
        }
        map[ex.id] = arr;
      }
      setSetsByEx(map);
      setLoading(false);
    };
    init();
  }, [dayId, user]);

  const current = exercises[currentIdx];
  const sets = current ? setsByEx[current.id] ?? [] : [];

  const totalDone = useMemo(
    () => Object.values(setsByEx).reduce((acc, arr) => acc + arr.filter((s) => s.done).length, 0),
    [setsByEx]
  );
  const totalSets = useMemo(
    () => exercises.reduce((acc, e) => acc + e.sets, 0),
    [exercises]
  );

  const updateSet = (idx: number, patch: Partial<SetEntry>) => {
    if (!current) return;
    setSetsByEx((prev) => ({
      ...prev,
      [current.id]: prev[current.id].map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  };

  const completeSet = async (idx: number) => {
    if (!current || !sessionLogId) return;
    const s = sets[idx];
    const payload = {
      session_log_id: sessionLogId,
      exercise_id: current.id,
      set_number: s.set_number,
      reps: s.reps ? Number(s.reps) : null,
      weight_kg: s.weight_kg ? Number(s.weight_kg) : null,
      rpe: s.rpe ? Number(s.rpe) : null,
      done: true,
    };

    if (s.log_id) {
      await supabase.from("set_logs").update(payload as any).eq("id", s.log_id);
      updateSet(idx, { done: true });
    } else {
      const { data, error } = await supabase
        .from("set_logs")
        .insert(payload as any)
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      updateSet(idx, { done: true, log_id: (data as any).id });
    }

    // Pokreni odmor
    const r = current.rest_seconds ?? 60;
    setRestTotal(r);
    setRest(r);
  };

  const doFinishWorkout = async () => {
    if (!sessionLogId) return;
    setFinishing(true);
    await supabase
      .from("workout_session_logs")
      .update({
        completed_at: new Date().toISOString(),
      } as any)
      .eq("id", sessionLogId);
    setFinishing(false);
    setConfirmFinishOpen(false);
    toast.success("Trening završen! 💪");
    nav("/vezbac");
  };

  const finishWorkout = () => setConfirmFinishOpen(true);

  if (loading) {
    return (
      <PhoneShell back="/vezbac" hasBottomNav title="Učitavanje..." eyebrow="Trening">
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </PhoneShell>
    );
  }

  if (!day || exercises.length === 0) {
    return (
      <>
        <PhoneShell back="/vezbac" hasBottomNav title={day?.name ?? "Trening"} eyebrow="Aktivni trening">
          <Card className="p-6 text-center text-[14px] text-muted-foreground">
            Ovaj dan još nema dodate vežbe.
          </Card>
        </PhoneShell>
        <BottomNav role="athlete" />
      </>
    );
  }

  const restPct = restTotal > 0 ? (rest / restTotal) * 100 : 0;
  const allDone = totalDone === totalSets && totalSets > 0;

  return (
    <>
      <PhoneShell back="/vezbac" hasBottomNav title={day.name} eyebrow={`Dan ${day.day_number}`}>
        {/* Progress bar */}
        <div>
          <div className="flex justify-between mb-2 text-[12px] text-muted-foreground">
            <span>Napredak treninga</span>
            <span className="tnum font-semibold text-foreground">{totalDone}/{totalSets} setova</span>
          </div>
          <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-brand transition-all"
              style={{ width: `${totalSets ? (totalDone / totalSets) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Exercise switcher */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            className="h-10 w-10 rounded-full bg-surface border border-hairline flex items-center justify-center disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 text-center">
            <div className="font-display text-[20px] font-bold tracking-tighter leading-tight">
              {current.exercises?.name ?? "Vežba"}
            </div>
            <div className="text-[12.5px] text-muted-foreground">
              {current.sets} setova · {current.reps ?? "—"} reps
              {current.weight_kg ? ` · cilj ${current.weight_kg} kg` : ""}
            </div>
          </div>
          <button
            onClick={() => setCurrentIdx((i) => Math.min(exercises.length - 1, i + 1))}
            disabled={currentIdx === exercises.length - 1}
            className="h-10 w-10 rounded-full bg-surface border border-hairline flex items-center justify-center disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <Chip tone="info" size="md" className="mx-auto">
          Vežba {currentIdx + 1} od {exercises.length}
        </Chip>

        {/* Trener zadao */}
        <Card className="p-3.5 bg-primary-soft/50 border-primary/15">
          <div className="flex items-start gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Trophy className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/80">
                Trener ti je zadao
              </div>
              <div className="text-[14px] font-bold text-foreground mt-0.5">
                {current.sets} × {current.reps ?? "—"} ponavljanja
                {current.weight_kg ? ` sa ${current.weight_kg} kg` : ""}
              </div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug">
                Polja su već popunjena. Klikni ✓ ako si odradio tako, ili izmeni broj pre nego što potvrdiš.
              </div>
            </div>
          </div>
        </Card>

        {/* Set rows */}
        <Card className="p-4 overflow-hidden">
          <div className="grid grid-cols-[22px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_32px] gap-1.5 px-1 pb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80 font-semibold border-b border-hairline">
            <span>Set</span>
            <span className="text-center">Kg</span>
            <span className="text-center">Ponavljanja</span>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-center inline-flex items-center justify-center gap-1 hover:text-foreground transition"
                >
                  Težina
                  <HelpCircle className="h-3 w-3" strokeWidth={2.2} />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" className="w-64 text-[12px] leading-relaxed normal-case tracking-normal font-normal">
                <div className="font-semibold text-[13px] mb-1.5 text-foreground">Koliko ti je bilo teško?</div>
                <div className="text-muted-foreground mb-2">Oceni od 1 do 10:</div>
                <ul className="space-y-1 text-muted-foreground">
                  <li><span className="font-semibold text-foreground">1–4</span> · lako, mogao si još puno</li>
                  <li><span className="font-semibold text-foreground">5–6</span> · srednje, ostalo 4–5 ponavljanja</li>
                  <li><span className="font-semibold text-foreground">7–8</span> · teško, ostalo 2–3 ponavljanja</li>
                  <li><span className="font-semibold text-foreground">9</span> · jedva, ostalo 1 ponavljanje</li>
                  <li><span className="font-semibold text-foreground">10</span> · maksimum, više nisi mogao</li>
                </ul>
              </PopoverContent>
            </Popover>
            <span></span>
          </div>
          {sets.map((s, i) => (
            <div
              key={i}
              className="grid grid-cols-[22px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_32px] gap-1.5 items-center py-2 border-b border-hairline last:border-b-0"
            >
              <span className="text-[12px] text-muted-foreground font-semibold tnum">{s.set_number}</span>
              <input
                inputMode="decimal"
                value={s.weight_kg}
                onChange={(e) => updateSet(i, { weight_kg: e.target.value })}
                disabled={s.done}
                placeholder="–"
                className={cn(
                  "w-full min-w-0 rounded-xl py-2 text-center text-[15px] font-bold tnum focus:outline-none focus:ring-2 focus:ring-primary/40",
                  s.done ? "bg-surface-2 text-foreground" : "bg-primary-soft text-primary-soft-foreground"
                )}
              />
              <input
                inputMode="numeric"
                value={s.reps}
                onChange={(e) => updateSet(i, { reps: e.target.value })}
                disabled={s.done}
                placeholder="–"
                className={cn(
                  "w-full min-w-0 rounded-xl py-2 text-center text-[15px] font-bold tnum focus:outline-none focus:ring-2 focus:ring-primary/40",
                  s.done ? "bg-surface-2 text-foreground" : "bg-primary-soft text-primary-soft-foreground"
                )}
              />
              <input
                inputMode="decimal"
                value={s.rpe}
                onChange={(e) => updateSet(i, { rpe: e.target.value })}
                disabled={s.done}
                placeholder="–"
                className={cn(
                  "w-full min-w-0 rounded-xl py-2 text-center text-[15px] font-bold tnum focus:outline-none focus:ring-2 focus:ring-primary/40",
                  s.done ? "bg-surface-2 text-foreground" : "bg-primary-soft text-primary-soft-foreground"
                )}
              />
              {s.done ? (
                <div className="h-7 w-7 mx-auto rounded-full bg-success text-white flex items-center justify-center">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </div>
              ) : (
                <button
                  onClick={() => completeSet(i)}
                  className="h-7 w-7 mx-auto rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition"
                  aria-label="Završi set"
                >
                  <Check className="h-4 w-4" strokeWidth={3} />
                </button>
              )}
            </div>
          ))}
        </Card>

        {/* Rest timer */}
        {rest > 0 && (
          <Card className="p-6 bg-gradient-brand-soft border-0 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-2">
              Odmor
            </div>
            <div className="relative inline-flex items-center justify-center">
              <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--hairline))" strokeWidth="8" />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="url(#brandGrad)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 52}
                  strokeDashoffset={2 * Math.PI * 52 * (1 - restPct / 100)}
                  className="transition-all duration-1000"
                />
                <defs>
                  <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="hsl(322 82% 56%)" />
                    <stop offset="100%" stopColor="hsl(252 82% 60%)" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-display text-[40px] font-bold tracking-tightest tnum">
                  {formatTime(rest)}
                </span>
              </div>
            </div>
            <button
              onClick={() => setRest(0)}
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Preskoči
            </button>
          </Card>
        )}

        {allDone ? (
          <Button variant="brand" size="lg" fullWidth onClick={finishWorkout}>
            <Trophy className="h-4 w-4 mr-2" /> Završi trening
          </Button>
        ) : currentIdx < exercises.length - 1 ? (
          <Button variant="brand" size="lg" fullWidth onClick={() => setCurrentIdx((i) => i + 1)}>
            Sledeća vežba →
          </Button>
        ) : (
          <Button variant="brand" size="lg" fullWidth onClick={finishWorkout}>
            Završi trening
          </Button>
        )}
      </PhoneShell>
      <BottomNav role="athlete" />

      <AlertDialog
        open={alreadyDoneToday.open}
        onOpenChange={(open) => setAlreadyDoneToday((p) => ({ ...p, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Već si završio ovaj trening danas</AlertDialogTitle>
            <AlertDialogDescription>
              Ovaj dan iz programa je već markiran kao završen
              {alreadyDoneToday.completedAt
                ? ` u ${new Date(alreadyDoneToday.completedAt).toLocaleTimeString("sr-Latn-RS", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : ""}
              . Da li si siguran da želiš da pokreneš novi trening za isti dan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => nav("/vezbac")}>Nazad</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setAlreadyDoneToday({ open: false, completedAt: null })}
            >
              Da, pokreni opet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmFinishOpen} onOpenChange={setConfirmFinishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Završiti trening?</AlertDialogTitle>
            <AlertDialogDescription>
              {allDone
                ? "Svi setovi su odrađeni. Da li želiš da završiš i sačuvaš trening?"
                : `Odradio si ${totalDone} od ${totalSets} setova. Ako završiš sada, ostali setovi neće biti zabeleženi.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={finishing}>Otkaži</AlertDialogCancel>
            <AlertDialogAction onClick={doFinishWorkout} disabled={finishing}>
              {finishing ? "Čuvanje..." : "Da, završi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ActiveWorkout;
