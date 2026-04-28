import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card } from "@/components/ui-bits";
import { Loader2, Play, Dumbbell, History, CalendarDays, Flame } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { getNextWorkoutDay, type NextWorkoutDay } from "@/lib/workouts";
import { cn } from "@/lib/utils";

type RecentLog = {
  id: string;
  day_number: number;
  completed_at: string | null;
  duration_seconds: number | null;
};

type ProgramDay = {
  id: string;
  day_number: number;
  name: string;
  exercise_count: number;
};

const WorkoutHome = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [next, setNext] = useState<NextWorkoutDay | null>(null);
  const [exerciseCount, setExerciseCount] = useState(0);
  const [recent, setRecent] = useState<RecentLog[]>([]);
  const [allDays, setAllDays] = useState<ProgramDay[]>([]);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);

      const nextDay = await getNextWorkoutDay(user.id);
      setNext(nextDay ?? null);

      if (nextDay) {
        const { count } = await supabase
          .from("assigned_program_exercises")
          .select("id", { count: "exact", head: true })
          .eq("day_id", nextDay.day_id);
        setExerciseCount(count ?? 0);

        // Učitaj sve dane iz programa da vežbač može opet da pokrene bilo koji
        const { data: daysData } = await supabase
          .from("assigned_program_days")
          .select("id, day_number, name, assigned_program_exercises(id)")
          .eq("assigned_program_id", nextDay.assigned_program_id)
          .order("day_number", { ascending: true });

        const list: ProgramDay[] = ((daysData as any[]) ?? []).map((d) => ({
          id: d.id,
          day_number: d.day_number,
          name: d.name,
          exercise_count: (d.assigned_program_exercises ?? []).length,
        }));
        setAllDays(list);
      } else {
        setAllDays([]);
      }

      const { data: logs } = await supabase
        .from("workout_session_logs")
        .select("id, day_number, completed_at, duration_seconds")
        .eq("athlete_id", user.id)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(5);
      setRecent((logs as any[]) ?? []);

      const { data: streakData } = await supabase.rpc("get_athlete_streak", { p_athlete_id: user.id } as any);
      const sd = (streakData as any[])?.[0];
      if (sd) setStreak(sd.current_streak_days ?? 0);

      setLoading(false);
    };
    load();
  }, [user]);

  const formatDuration = (sec: number | null) => {
    if (!sec) return "—";
    const m = Math.round(sec / 60);
    return `${m} min`;
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("sr-Latn-RS", { day: "numeric", month: "short" });
  };

  return (
    <>
      <PhoneShell
        hasBottomNav
        eyebrow="Trening"
        title={
          <h1 className="font-display text-[28px] leading-[1.05] font-bold tracking-tightest">
            Tvoji treninzi
          </h1>
        }
      >
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : next ? (
          <button
            onClick={() => nav(`/vezbac/trening/${next.day_id}`)}
            className="block w-full text-left"
          >
            <Card className="p-5 bg-gradient-brand text-white border-0 shadow-brand relative overflow-hidden">
              <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
              <div className="relative">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80 mb-2">
                  Sledeći trening
                </div>
                <div className="font-display text-[26px] font-bold tracking-tighter leading-tight">
                  {next.day_name}
                </div>
                <div className="text-[13px] text-white/85 mt-1.5">
                  {next.program_name} · Dan {next.day_number} od {next.total_days}
                </div>
                <div className="mt-4 text-[13px] text-white/90">
                  {exerciseCount} {exerciseCount === 1 ? "vežba" : "vežbi"} na rasporedu
                </div>
                <div className="mt-5 inline-flex items-center gap-2 bg-white text-foreground rounded-full px-4 py-2 text-[13px] font-bold shadow-soft">
                  <Play className="h-3.5 w-3.5 fill-foreground" /> Počni trening
                </div>
              </div>
            </Card>
          </button>
        ) : (
          <Card className="p-6 text-center space-y-3">
            <div className="h-12 w-12 mx-auto rounded-2xl bg-muted flex items-center justify-center">
              <Dumbbell className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="font-display text-[18px] font-bold tracking-tight">
              Nemaš još dodeljen program
            </div>
            <p className="text-[13px] text-muted-foreground">
              Kontaktiraj trenera da ti dodeli plan treninga.
            </p>
          </Card>
        )}

        {allDays.length > 0 && (
          <section>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-3">
              <CalendarDays className="h-3.5 w-3.5" />
              Svi dani u programu
            </div>
            <div className="space-y-2">
              {allDays.map((d) => {
                const isNext = next?.day_id === d.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => nav(`/vezbac/trening/${d.id}`)}
                    className="block w-full text-left"
                  >
                    <Card
                      className={cn(
                        "p-4 flex items-center gap-3 transition active:scale-[0.99]",
                        isNext && "ring-2 ring-primary/40"
                      )}
                    >
                      <div
                        className={cn(
                          "h-10 w-10 rounded-2xl flex items-center justify-center font-display text-[15px] font-bold tnum",
                          isNext
                            ? "bg-gradient-brand text-white"
                            : "bg-gradient-brand-soft text-primary"
                        )}
                      >
                        {d.day_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-semibold tracking-tight truncate">
                          {d.name}
                        </div>
                        <div className="text-[12px] text-muted-foreground">
                          {d.exercise_count} {d.exercise_count === 1 ? "vežba" : "vežbi"}
                          {isNext && " · sledeći u rotaciji"}
                        </div>
                      </div>
                      <Play className="h-4 w-4 text-primary fill-primary" />
                    </Card>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-3">
            <History className="h-3.5 w-3.5" />
            Poslednji treninzi
          </div>

          {recent.length === 0 ? (
            <Card className="p-5 text-[13px] text-muted-foreground">
              Još nemaš završenih treninga. Završi prvi trening da se pojavi ovde.
            </Card>
          ) : (
            <div className="space-y-2">
              {recent.map((log) => (
                <Card key={log.id} className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-gradient-brand-soft text-primary flex items-center justify-center">
                    <Dumbbell className="h-[18px] w-[18px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold tracking-tight">
                      Dan {log.day_number}
                    </div>
                    <div className="text-[12px] text-muted-foreground">
                      {formatDate(log.completed_at)} · {formatDuration(log.duration_seconds)}
                    </div>
                  </div>
                </Card>
              ))}
              <Link
                to="/vezbac/napredak"
                className="block text-center text-[12.5px] font-semibold text-primary py-2"
              >
                Vidi sve →
              </Link>
            </div>
          )}
        </section>
      </PhoneShell>
      <BottomNav role="athlete" />
    </>
  );
};

export default WorkoutHome;
