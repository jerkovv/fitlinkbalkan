import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Check, MessageSquare, Clock, Dumbbell, Flame, Heart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type SessionRow = {
  id: string;
  athlete_id: string;
  assigned_program_id: string | null;
  day_id: string | null;
  day_number: number | null;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
  total_volume_kg: number | null;
  active_calories: number | null;
  live_hr_avg: number | null;
  live_hr_max: number | null;
};

type SetRow = {
  id: string;
  exercise_id: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  done: boolean;
};

type ExRow = {
  id: string;
  position: number;
  sets: number;
  exercises: { name: string; primary_muscle: string | null } | null;
};

const fmtDuration = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
};

const WorkoutSummary = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [exercises, setExercises] = useState<ExRow[]>([]);
  const [showCheck, setShowCheck] = useState(false);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    if (!sessionId || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);

      // Load session
      let { data: sess } = await supabase
        .from("workout_session_logs")
        .select(
          "id, athlete_id, assigned_program_id, day_id, day_number, started_at, completed_at, notes, total_volume_kg, active_calories, live_hr_avg, live_hr_max"
        )
        .eq("id", sessionId)
        .maybeSingle();

      // If not yet completed, complete it now (defensive — usually done by ActiveWorkout)
      if (sess && !(sess as any).completed_at) {
        await supabase.rpc("complete_workout_session", {
          p_session_id: sessionId,
          p_hr_avg: null,
          p_hr_max: null,
          p_hr_min: null,
          p_active_calories: null,
          p_hr_series: null,
        } as any);
        const reload = await supabase
          .from("workout_session_logs")
          .select(
            "id, athlete_id, assigned_program_id, day_id, day_number, started_at, completed_at, notes, total_volume_kg, active_calories, live_hr_avg, live_hr_max"
          )
          .eq("id", sessionId)
          .maybeSingle();
        sess = reload.data as any;
      }

      if (!sess) {
        toast.error("Trening nije pronađen");
        if (!cancelled) setLoading(false);
        return;
      }

      const sessionRow = sess as SessionRow;
      if (cancelled) return;
      setSession(sessionRow);
      setNoteText(sessionRow.notes ?? "");

      // Load sets
      const { data: setData } = await supabase
        .from("set_logs")
        .select("id, exercise_id, set_number, reps, weight_kg, done")
        .eq("session_log_id", sessionId);
      if (cancelled) return;
      setSets(((setData as any[]) ?? []) as SetRow[]);

      // Load exercises for this day
      if (sessionRow.day_id) {
        const { data: exData } = await supabase
          .from("assigned_program_exercises")
          .select("id, position, sets, exercises(name, primary_muscle)")
          .eq("day_id", sessionRow.day_id)
          .order("position", { ascending: true });
        if (cancelled) return;
        setExercises(((exData as any[]) ?? []) as ExRow[]);
      }

      setLoading(false);
      setTimeout(() => setShowCheck(true), 60);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, user]);

  const stats = useMemo(() => {
    if (!session) return null;
    const start = new Date(session.started_at).getTime();
    const end = session.completed_at ? new Date(session.completed_at).getTime() : Date.now();
    const completedSets = sets.filter((s) => s.done).length;
    const totalReps = sets.reduce((a, s) => a + (s.done ? Number(s.reps ?? 0) : 0), 0);
    const totalVolume =
      session.total_volume_kg != null
        ? Number(session.total_volume_kg)
        : sets.reduce(
            (a, s) =>
              a + (s.done ? Number(s.reps ?? 0) * Number(s.weight_kg ?? 0) : 0),
            0
          );
    return {
      durationMs: end - start,
      completedSets,
      totalReps,
      totalVolume,
      hrAvg: session.live_hr_avg,
      hrMax: session.live_hr_max,
      kcal: session.active_calories,
    };
  }, [session, sets]);

  const exerciseSummaries = useMemo(() => {
    return exercises.map((ex) => {
      const exSets = sets.filter((s) => s.exercise_id === ex.id);
      const done = exSets.filter((s) => s.done);
      const reps = done.reduce((a, s) => a + Number(s.reps ?? 0), 0);
      const maxW = done.reduce((a, s) => Math.max(a, Number(s.weight_kg ?? 0)), 0);
      return {
        id: ex.id,
        name: ex.exercises?.name ?? "Vežba",
        muscle: ex.exercises?.primary_muscle ?? null,
        doneSets: done.length,
        totalSets: ex.sets,
        reps,
        maxWeight: maxW,
      };
    });
  }, [exercises, sets]);

  const saveNote = async () => {
    if (!sessionId) return;
    setSavingNote(true);
    const { error } = await supabase
      .from("workout_session_logs")
      .update({ notes: noteText.trim() || null } as any)
      .eq("id", sessionId);
    setSavingNote(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (session) setSession({ ...session, notes: noteText.trim() || null });
    setNoteOpen(false);
    toast.success("Komentar poslat treneru");
  };

  if (loading || !session || !stats) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div
        className="mx-auto w-full max-w-[440px] min-h-screen px-4 pb-10"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 20px) + 24px)" }}
      >
        {/* Hero check */}
        <div className="text-center pt-6 pb-2">
          <div
            className={cn(
              "mx-auto h-20 w-20 rounded-full bg-success text-white flex items-center justify-center transition-all duration-500",
              showCheck ? "scale-100 opacity-100" : "scale-50 opacity-0"
            )}
            style={{ boxShadow: "0 12px 40px -10px hsl(var(--success) / 0.55)" }}
          >
            <Check className="h-10 w-10" strokeWidth={3.2} />
          </div>
          <h1 className="font-display text-[30px] font-bold tracking-tightest leading-tight mt-5">
            Trening završen
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1.5">
            Sjajan posao 💪 Tvoj napredak je sačuvan.
          </p>
        </div>

        {/* Stats grid 2x2 */}
        <div className="grid grid-cols-2 gap-3 mt-6">
          <StatTile
            icon={<Clock className="h-4 w-4" />}
            label="Trajanje"
            value={fmtDuration(stats.durationMs)}
          />
          <StatTile
            icon={<Dumbbell className="h-4 w-4" />}
            label="Ukupan volumen"
            value={`${Math.round(stats.totalVolume)} kg`}
          />
          <StatTile
            icon={<Check className="h-4 w-4" />}
            label="Završenih serija"
            value={String(stats.completedSets)}
          />
          <StatTile
            icon={<Heart className="h-4 w-4" />}
            label="Prosečan puls"
            value={stats.hrAvg ? `${stats.hrAvg} bpm` : "—"}
          />
        </div>

        {(stats.hrMax || stats.kcal) && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            {stats.hrMax != null && (
              <StatTile
                icon={<Heart className="h-4 w-4" />}
                label="Max puls"
                value={`${stats.hrMax} bpm`}
              />
            )}
            {stats.kcal != null && (
              <StatTile
                icon={<Flame className="h-4 w-4" />}
                label="Aktivne kcal"
                value={String(Math.round(stats.kcal))}
              />
            )}
          </div>
        )}

        {/* Exercises summary */}
        <section className="mt-7">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-3">
            Po vežbi
          </h2>
          <div className="rounded-3xl bg-surface border border-hairline overflow-hidden">
            {exerciseSummaries.length === 0 && (
              <div className="px-4 py-6 text-[13px] text-muted-foreground text-center">
                Nema podataka.
              </div>
            )}
            {exerciseSummaries.map((ex) => (
              <div
                key={ex.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-hairline last:border-b-0"
              >
                <div className="h-9 w-9 rounded-2xl bg-primary-soft text-primary flex items-center justify-center shrink-0">
                  <Dumbbell className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-foreground truncate">
                    {ex.name}
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    {ex.doneSets}/{ex.totalSets} serija · {ex.reps} ponavljanja
                    {ex.maxWeight > 0 ? ` · ${ex.maxWeight} kg` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Note button */}
        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className="w-full mt-6 inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-surface border border-hairline text-[14px] font-semibold active:scale-[0.98] transition"
        >
          <MessageSquare className="h-4 w-4" />
          {session.notes ? "Izmeni komentar treneru" : "Pošalji treneru komentar"}
        </button>

        {session.notes && (
          <div className="mt-3 rounded-2xl bg-surface-2 border border-hairline p-3 text-[13px] text-muted-foreground whitespace-pre-line">
            {session.notes}
          </div>
        )}

        <button
          type="button"
          onClick={() => nav("/vezbac")}
          className="w-full mt-8 h-14 rounded-2xl bg-gradient-brand text-white font-bold text-[15px] inline-flex items-center justify-center shadow-brand active:scale-[0.98] transition"
        >
          Vrati se na početnu
        </button>
      </div>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Komentar treneru</DialogTitle>
            <DialogDescription>
              Kratko opiši kako se trening osetio, šta je bilo teško ili lako.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={5}
            placeholder="npr. Squat je bio težak, levo koleno me malo žuljalo."
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => setNoteOpen(false)}
              className="px-4 h-11 rounded-xl bg-surface border border-hairline text-[14px] font-semibold"
            >
              Otkaži
            </button>
            <button
              type="button"
              onClick={saveNote}
              disabled={savingNote}
              className="px-5 h-11 rounded-xl bg-gradient-brand text-white text-[14px] font-bold shadow-brand disabled:opacity-60"
            >
              {savingNote ? "Čuvanje..." : "Sačuvaj"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const StatTile = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <div className="rounded-2xl bg-surface border border-hairline p-4">
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      <span className="text-primary">{icon}</span>
      {label}
    </div>
    <div className="font-display text-[24px] font-bold tracking-tightest tnum mt-1.5 text-foreground">
      {value}
    </div>
  </div>
);

export default WorkoutSummary;
