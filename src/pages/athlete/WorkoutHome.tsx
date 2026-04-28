import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card } from "@/components/ui-bits";
import { Loader2, Play, Dumbbell, History } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

type NextDay = {
  assigned_program_id: string;
  program_name: string;
  day_id: string;
  day_number: number;
  day_name: string;
  total_days: number;
};

type RecentLog = {
  id: string;
  day_number: number;
  completed_at: string | null;
  duration_seconds: number | null;
};

const WorkoutHome = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [next, setNext] = useState<NextDay | null>(null);
  const [exerciseCount, setExerciseCount] = useState(0);
  const [recent, setRecent] = useState<RecentLog[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);

      const { data: nd } = await supabase.rpc("get_next_workout_day", {
        p_athlete_id: user.id,
      });
      const nextDay = (nd as any[])?.[0] as NextDay | undefined;
      setNext(nextDay ?? null);

      if (nextDay) {
        const { count } = await supabase
          .from("assigned_program_exercises")
          .select("id", { count: "exact", head: true })
          .eq("day_id", nextDay.day_id);
        setExerciseCount(count ?? 0);
      }

      const { data: logs } = await supabase
        .from("workout_session_logs")
        .select("id, day_number, completed_at, duration_seconds")
        .eq("athlete_id", user.id)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(5);
      setRecent((logs as any[]) ?? []);

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
    return d.toLocaleDateString("sr-RS", { day: "numeric", month: "short" });
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
