import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { AthleteOnboardingTour } from "@/components/AthleteOnboardingTour";
import { BottomNav } from "@/components/BottomNav";
import { Card } from "@/components/ui-bits";
import { Loader2, Play, Dumbbell, History, CalendarDays, Flame, AlertTriangle, RefreshCw, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useClanarinaLock } from "@/components/clanarina/useClanarinaLock";
import { getNextWorkoutDay, type NextWorkoutDay } from "@/lib/workouts";
import { markWorkoutEntered, hasEnteredWorkout } from "@/lib/workoutSession";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InAppWorkoutsList } from "@/components/InAppWorkoutsList";
import { WorkoutsList } from "@/components/wearables/WorkoutsList";

type ProgramDay = {
  id: string;
  day_number: number;
  name: string;
  exercise_count: number;
};

const WorkoutHome = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const { hasAccess, guard } = useClanarinaLock();
  const [loading, setLoading] = useState(true);
  const [next, setNext] = useState<NextWorkoutDay | null>(null);
  const [exerciseCount, setExerciseCount] = useState(0);
  const [allDays, setAllDays] = useState<ProgramDay[]>([]);
  const [streak, setStreak] = useState(0);
  const [daysInactive, setDaysInactive] = useState<number>(0);
  const [hasEverTrained, setHasEverTrained] = useState(true);

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
          .eq("day_id", nextDay.day_id)
          .is("deleted_at", null);
        setExerciseCount(count ?? 0);

        // Učitaj sve dane iz programa da vežbač može opet da pokrene bilo koji
        const { data: daysData } = await supabase
          .from("assigned_program_days")
          .select("id, day_number, name, assigned_program_exercises(id)")
          .eq("assigned_program_id", nextDay.assigned_program_id)
          .is("deleted_at", null)
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

      const { data: streakData } = await supabase.rpc("get_athlete_streak", { p_athlete_id: user.id } as any);
      const sd = (streakData as any[])?.[0];
      if (sd) setStreak(sd.current_streak_days ?? 0);

      const { data: lastWk } = await supabase.rpc("get_athlete_last_workout", { p_athlete_id: user.id } as any);
      const lw = (lastWk as any[])?.[0];
      if (lw) {
        setDaysInactive(lw.days_inactive ?? 0);
        setHasEverTrained(!!lw.last_workout_at);
      }

      setLoading(false);
    };
    load();
  }, [user]);

  // Automatski udji u aktivan trening (npr pokrenut sa sata) - isti ekran/tok kao kad se
  // pokrene sa telefona. Preskace sesije u koje je vezbac vec usao (bez trap-a i duple
  // navigacije). Kraj sesije (is_active=false) -> nema auto-enter, home ostaje normalan.
  // false posle unmount-a: async mount-check ne sme da navigira ako je korisnik vec
  // otisao (npr tapnuo drugi dan pre nego sto upit zavrsi).
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  const enterActive = useCallback(
    (sessionId: string | null | undefined, dayId: string | null | undefined) => {
      if (!aliveRef.current) return;
      if (!sessionId || !dayId) return;
      if (hasEnteredWorkout(sessionId)) return;
      markWorkoutEntered(sessionId);
      nav(`/vezbac/trening/${dayId}`);
    },
    [nav],
  );

  // Mount + povratak u prvi plan: uhvati sesiju koja je vec aktivna (sat je pokrenuo dok je
  // app bio zatvoren / u pozadini - realtime tada ne isporucuje propusteni dogadjaj).
  const checkActiveSession = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("workout_session_logs")
      .select("id, day_id")
      .eq("athlete_id", user.id)
      .eq("is_active", true)
      .is("completed_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as any;
    if (row?.id && row?.day_id) enterActive(row.id, row.day_id);
  }, [user, enterActive]);

  useEffect(() => {
    checkActiveSession();
    const onVis = () => {
      if (document.visibilityState === "visible") checkActiveSession();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [checkActiveSession]);

  // Realtime: trening pokrenut sa sata dok smo na home -> udji odmah (bez cekanja polla).
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`home-active-workout:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workout_session_logs",
          filter: `athlete_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row && row.is_active === true && !row.completed_at && row.day_id) {
            enterActive(row.id, row.day_id);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, enterActive]);

  return (
    <>
      <PhoneShell
        hasBottomNav
        eyebrow="Trening"
        title={
          <div className="flex items-end justify-between gap-3">
            <h1 className="font-display text-[28px] leading-[1.05] font-bold tracking-tightest">
              Tvoji treninzi
            </h1>
            {streak > 0 && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft/60 text-warning-soft-foreground px-3 py-1.5 text-[12px] font-bold tnum shrink-0">
                <Flame className="h-3.5 w-3.5" strokeWidth={2.5} />
                {streak} {streak === 1 ? "dan" : "dana"}
              </div>
            )}
          </div>
        }
      >
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : next ? (
          <>
            {daysInactive >= 4 && (
              <Card className="p-4 flex items-start gap-3 bg-[hsl(var(--session-amber-bg))] border-0">
                <div className="h-10 w-10 rounded-2xl bg-[hsl(var(--session-amber-fg))]/15 text-[hsl(var(--session-amber-fg))] flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-[18px] w-[18px]" strokeWidth={2.25} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold tracking-tight text-[hsl(var(--session-amber-fg))]">
                    {hasEverTrained
                      ? `Nisi trenirao ${daysInactive} dana`
                      : "Vreme je za prvi trening"}
                  </div>
                  <div className="text-[12.5px] text-[hsl(var(--session-amber-fg))]/85 mt-0.5">
                    {hasEverTrained
                      ? "Ne lomi naviku — kreni odmah, biće lakše nego što misliš."
                      : "Tvoj program te čeka. Krenimo polako."}
                  </div>
                </div>
              </Card>
            )}
            <button
              onClick={guard(() => nav(`/vezbac/trening/${next.day_id}`))}
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
                  {hasAccess ? <Play className="h-3.5 w-3.5 fill-foreground" /> : <Lock className="h-3.5 w-3.5" />} Počni trening
                </div>
              </div>
            </Card>
          </button>
          </>
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
                    onClick={guard(() => nav(`/vezbac/trening/${d.id}`))}
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
                      {hasAccess ? (
                        <Play className="h-4 w-4 text-primary fill-primary" />
                      ) : (
                        <Lock className="h-4 w-4 text-primary" />
                      )}
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
            Treninzi
          </div>

          <Tabs defaultValue="app" className="w-full">
            <TabsList className="grid grid-cols-2 w-full mb-1">
              <TabsTrigger
                value="app"
                className="data-[state=active]:bg-gradient-brand data-[state=active]:text-white data-[state=active]:shadow-brand"
              >
                Iz aplikacije
              </TabsTrigger>
              <TabsTrigger
                value="watch"
                className="data-[state=active]:bg-gradient-brand data-[state=active]:text-white data-[state=active]:shadow-brand"
              >
                Sa sata
              </TabsTrigger>
            </TabsList>
            <TabsContent value="app">
              <p className="text-xs text-muted-foreground mt-2 mb-3">
                Treninzi koje si radio kroz FitLink. Ako si nosio sat, puls i kalorije su vec ovde.
              </p>
              <InAppWorkoutsList limit={10} />
            </TabsContent>
            <TabsContent value="watch">
              <p className="text-xs text-muted-foreground mt-2 mb-3">
                Aktivnosti koje si radio bez FitLink-a, direktno na satu. Sinhronizuj ih da budu na jednom mestu.
              </p>
              <div className="flex justify-end mb-3">
                <button
                  onClick={() => nav("/vezbac/integracije")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-foreground hover:bg-surface-2 transition active:scale-95"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Sinhronizuj sat
                </button>
              </div>
              <WorkoutsList limit={10} />
            </TabsContent>
          </Tabs>
        </section>
      </PhoneShell>
      <BottomNav role="athlete" />
      <AthleteOnboardingTour />
    </>
  );
};

export default WorkoutHome;
