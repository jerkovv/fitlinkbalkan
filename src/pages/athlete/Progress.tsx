import { useEffect, useMemo, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card, SectionTitle } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Plus, Loader2, Dumbbell, Scale, Flame, CalendarCheck, Target, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ProgressPhotos } from "@/components/ProgressPhotos";

const tabs = ["Treninzi", "Telo"] as const;

type SessionLog = {
  id: string;
  day_number: number;
  completed_at: string | null;
  duration_seconds: number | null;
  assigned_programs: { name: string } | null;
  assigned_program_days: { name: string } | null;
};

type Metric = {
  id: string;
  recorded_on: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  notes: string | null;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("sr-Latn-RS", { day: "numeric", month: "short" });

const Progress = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Treninzi");
  const [loading, setLoading] = useState(true);

  const [sessions, setSessions] = useState<SessionLog[]>([]);
  const [monthCount, setMonthCount] = useState(0);
  const [weekCount, setWeekCount] = useState(0);

  // Trener stats
  const [trainerSessionsAll, setTrainerSessionsAll] = useState(0);
  const [trainerSessionsMonth, setTrainerSessionsMonth] = useState(0);
  const [sessionsLeft, setSessionsLeft] = useState<number | null>(null);
  const [streak, setStreak] = useState(0); // weeks streak (legacy)
  const [streakDays, setStreakDays] = useState(0);
  const [longestDays, setLongestDays] = useState(0);
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [weeklyHistory, setWeeklyHistory] = useState<{ label: string; count: number }[]>([]);
  const [trainerName, setTrainerName] = useState<string>("");
  const [prs, setPrs] = useState<Array<{ id: string; exercise_name: string; best_weight_kg: number | null; best_weight_reps: number | null; best_e1rm_kg: number | null; best_e1rm_at: string | null }>>([]);

  const [metrics, setMetrics] = useState<Metric[]>([]);

  // Add metric dialog
  const [addOpen, setAddOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);

      const { data: ses } = await supabase
        .from("workout_session_logs")
        .select("id, day_number, completed_at, duration_seconds, assigned_programs(name), assigned_program_days(name)")
        .eq("athlete_id", user.id)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(30);
      setSessions((ses as any) ?? []);

      const now = new Date();
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startWeek = new Date(now);
      startWeek.setDate(now.getDate() - 7);
      const list = ((ses as any[]) ?? []) as SessionLog[];
      setMonthCount(list.filter((s) => s.completed_at && new Date(s.completed_at) >= startMonth).length);
      setWeekCount(list.filter((s) => s.completed_at && new Date(s.completed_at) >= startWeek).length);

      const { data: met } = await supabase
        .from("body_metrics")
        .select("id, recorded_on, weight_kg, body_fat_pct, notes")
        .eq("athlete_id", user.id)
        .order("recorded_on", { ascending: false })
        .limit(30);
      setMetrics((met as any) ?? []);

      // ===== TRENER ANALITIKA =====
      const todayISO = new Date().toISOString().slice(0, 10);
      const startMonthISO = startMonth.toISOString().slice(0, 10);

      // Sve realizovane sesije sa trenerom (booked u prošlosti ili attended)
      const { data: tBookings } = await supabase
        .from("session_bookings")
        .select("date, status, trainer_id")
        .eq("athlete_id", user.id)
        .in("status", ["booked", "attended"])
        .lte("date", todayISO);
      const bookings = (tBookings as any[]) ?? [];
      setTrainerSessionsAll(bookings.length);
      setTrainerSessionsMonth(bookings.filter((b) => b.date >= startMonthISO).length);

      // Trener ime
      const trainerId = bookings[0]?.trainer_id;
      if (trainerId) {
        const { data: tp } = await supabase
          .from("profiles").select("full_name").eq("id", trainerId).maybeSingle();
        setTrainerName((tp as any)?.full_name ?? "");
      }

      // Aktivna članarina — koliko termina ostalo
      const { data: mems } = await supabase
        .from("memberships")
        .select("status, sessions_total, sessions_used, ends_on")
        .eq("athlete_id", user.id)
        .eq("status", "active")
        .order("ends_on", { ascending: false })
        .limit(1);
      const m = (mems as any[])?.[0];
      if (m && m.sessions_total != null) {
        setSessionsLeft(Math.max(0, (m.sessions_total ?? 0) - (m.sessions_used ?? 0)));
      } else {
        setSessionsLeft(null);
      }

      // Weekly history — poslednjih 8 nedelja (kombinuje bookings + workout logs)
      const allDates: string[] = [
        ...bookings.map((b) => b.date),
        ...((ses as any[]) ?? []).filter((s) => s.completed_at).map((s) => s.completed_at.slice(0, 10)),
      ];
      const weeks: { label: string; count: number; start: Date }[] = [];
      for (let i = 7; i >= 0; i--) {
        const ws = new Date(now);
        ws.setHours(0, 0, 0, 0);
        ws.setDate(now.getDate() - now.getDay() - i * 7); // nedelja počinje nedeljom
        const we = new Date(ws);
        we.setDate(ws.getDate() + 7);
        const wsISO = ws.toISOString().slice(0, 10);
        const weISO = we.toISOString().slice(0, 10);
        const count = allDates.filter((d) => d >= wsISO && d < weISO).length;
        weeks.push({
          label: ws.toLocaleDateString("sr-Latn-RS", { day: "numeric", month: "numeric" }),
          count,
          start: ws,
        });
      }
      setWeeklyHistory(weeks);

      // Streak — uzastopne nedelje (počev od trenutne unazad) sa bar 1 treningom
      let s = 0;
      for (let i = weeks.length - 1; i >= 0; i--) {
        if (weeks[i].count > 0) s++;
        else break;
      }
      setStreak(s);

      // Server-side streak (precizniji — uzastopni DANI)
      const { data: streakData } = await supabase.rpc("get_athlete_streak", { p_athlete_id: user.id } as any);
      const sd = (streakData as any[])?.[0];
      if (sd) {
        setStreakDays(sd.current_streak_days ?? 0);
        setLongestDays(sd.longest_streak_days ?? 0);
        setTotalWorkouts(sd.total_workouts ?? 0);
      }

      // Top 5 PR-ova (po e1rm, najsvežiji prvo za remi)
      const { data: prData } = await supabase
        .from("personal_records")
        .select("id, exercise_id, best_weight_kg, best_weight_reps, best_e1rm_kg, best_e1rm_at, exercises(name)")
        .eq("athlete_id", user.id)
        .order("best_e1rm_kg", { ascending: false, nullsFirst: false })
        .limit(8);
      setPrs(((prData as any[]) ?? []).map((p) => ({
        id: p.id,
        exercise_name: p.exercises?.name ?? "Vežba",
        best_weight_kg: p.best_weight_kg,
        best_weight_reps: p.best_weight_reps,
        best_e1rm_kg: p.best_e1rm_kg,
        best_e1rm_at: p.best_e1rm_at,
      })));

      setLoading(false);
    };
    load();
  }, [user]);

  const saveMetric = async () => {
    if (!user) return;
    if (!weight && !bodyFat) {
      toast.error("Unesi bar težinu ili % masti");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("body_metrics")
      .insert({
        athlete_id: user.id,
        weight_kg: weight ? Number(weight) : null,
        body_fat_pct: bodyFat ? Number(bodyFat) : null,
        notes: notes || null,
      } as any)
      .select("id, recorded_on, weight_kg, body_fat_pct, notes")
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMetrics((prev) => [data as any, ...prev]);
    setWeight(""); setBodyFat(""); setNotes("");
    setAddOpen(false);
    toast.success("Sačuvano");
  };

  // Chart logic
  const weightSeries = useMemo(() => {
    return [...metrics].reverse().filter((m) => m.weight_kg != null);
  }, [metrics]);

  const trend = useMemo(() => {
    if (weightSeries.length < 2) return null;
    const first = weightSeries[0].weight_kg!;
    const last = weightSeries[weightSeries.length - 1].weight_kg!;
    const diff = last - first;
    return { diff, pct: (diff / first) * 100 };
  }, [weightSeries]);

  const chartPath = useMemo(() => {
    if (weightSeries.length < 2) return null;
    const ws = weightSeries.map((m) => m.weight_kg!);
    const min = Math.min(...ws);
    const max = Math.max(...ws);
    const range = max - min || 1;
    const w = 280;
    const h = 90;
    const step = w / (ws.length - 1);
    const points = ws.map((v, i) => {
      const x = i * step;
      const y = h - 6 - ((v - min) / range) * (h - 12);
      return `${x},${y}`;
    });
    return {
      line: points.join(" "),
      area: `0,${h} ${points.join(" ")} ${w},${h}`,
      lastX: (ws.length - 1) * step,
      lastY: h - 6 - ((ws[ws.length - 1] - min) / range) * (h - 12),
      min, max,
    };
  }, [weightSeries]);

  return (
    <>
      <PhoneShell hasBottomNav title="Tvoj napredak" eyebrow="Statistike">
        <div className="inline-flex p-1 rounded-full bg-surface-2 border border-hairline">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-5 py-2 rounded-full text-[13px] font-semibold transition",
                tab === t
                  ? "bg-surface text-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tab === "Treninzi" ? (
          <>
            {/* HERO — Trener analitika */}
            <Card className="p-5 bg-gradient-to-br from-primary/8 via-surface to-surface relative overflow-hidden">
              <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-gradient-brand opacity-10 blur-2xl" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="eyebrow text-primary">
                    {trainerName ? `Sa trenerom ${trainerName.split(" ")[0]}` : "Sa trenerom"}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <div className="font-display text-[44px] leading-none font-bold tracking-tightest tnum">
                    {trainerSessionsAll}
                  </div>
                  <div className="text-[13px] text-muted-foreground font-medium">
                    {trainerSessionsAll === 1 ? "trening ukupno" : "treninga ukupno"}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 text-[12px]">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <CalendarCheck className="h-3.5 w-3.5" />
                    <span className="font-semibold text-foreground tnum">{trainerSessionsMonth}</span> ovog meseca
                  </span>
                  {sessionsLeft != null && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Target className="h-3.5 w-3.5" />
                      <span className="font-semibold text-foreground tnum">{sessionsLeft}</span> ostalo
                    </span>
                  )}
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Ove nedelje</div>
                  <Dumbbell className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="font-display text-[28px] font-bold tracking-tightest mt-1 tnum">{weekCount}</div>
                <div className="text-[12px] text-muted-foreground">treninga</div>
              </Card>
              <Card className={cn(
                "p-4",
                streakDays >= 3 && "bg-gradient-to-br from-warning-soft/40 to-surface"
              )}>
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Streak</div>
                  <Flame className={cn("h-3.5 w-3.5", streakDays >= 3 ? "text-warning-soft-foreground" : "text-muted-foreground")} />
                </div>
                <div className="font-display text-[28px] font-bold tracking-tightest mt-1 tnum">{streakDays}</div>
                <div className="text-[12px] text-muted-foreground">
                  {streakDays === 1 ? "dan" : "dana"} u nizu
                  {longestDays > streakDays && longestDays > 0 && (
                    <span className="text-muted-foreground/70"> · best {longestDays}</span>
                  )}
                </div>
              </Card>
            </div>

            {/* Bar chart — poslednjih 8 nedelja */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Aktivnost
                  </div>
                  <div className="text-[13px] text-foreground font-semibold mt-0.5">Poslednjih 8 nedelja</div>
                </div>
                {weeklyHistory.length > 0 && (
                  <div className="text-right">
                    <div className="font-display text-[20px] font-bold tracking-tightest tnum">
                      {(weeklyHistory.reduce((a, b) => a + b.count, 0) / 8).toFixed(1)}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">prosek/ned</div>
                  </div>
                )}
              </div>
              {(() => {
                const maxC = Math.max(1, ...weeklyHistory.map((w) => w.count));
                return (
                  <div className="flex items-end gap-1.5 h-24">
                    {weeklyHistory.map((w, i) => {
                      const isCurrent = i === weeklyHistory.length - 1;
                      const h = w.count === 0 ? 4 : (w.count / maxC) * 96;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                          <div className="w-full flex items-end h-full">
                            <div
                              className={cn(
                                "w-full rounded-t-md transition-all",
                                w.count === 0
                                  ? "bg-hairline"
                                  : isCurrent
                                  ? "bg-gradient-to-t from-primary to-primary/60"
                                  : "bg-primary/30"
                              )}
                              style={{ height: `${h}px` }}
                            />
                          </div>
                          <div className={cn(
                            "text-[9px] font-semibold tnum",
                            isCurrent ? "text-primary" : "text-muted-foreground"
                          )}>
                            {w.count}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </Card>

            {prs.length > 0 && (
              <section>
                <SectionTitle>Lični rekordi 🏆</SectionTitle>
                <Card className="divide-y divide-hairline">
                  {prs.map((p) => (
                    <div key={p.id} className="p-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-warning-soft/60 to-primary-soft text-primary flex items-center justify-center shrink-0">
                        <Sparkles className="h-4 w-4" strokeWidth={2.4} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[14px] truncate">{p.exercise_name}</div>
                        <div className="text-[12px] text-muted-foreground">
                          {p.best_weight_kg ? `${p.best_weight_kg} kg × ${p.best_weight_reps}` : "—"}
                          {p.best_e1rm_kg ? ` · 1RM ~${p.best_e1rm_kg} kg` : ""}
                        </div>
                      </div>
                      {p.best_e1rm_at && (
                        <div className="text-[11px] text-muted-foreground/80 tnum shrink-0">
                          {formatDate(p.best_e1rm_at)}
                        </div>
                      )}
                    </div>
                  ))}
                </Card>
              </section>
            )}

            <section>
              <SectionTitle>Istorija</SectionTitle>
              {sessions.length === 0 ? (
                <Card className="p-6 text-center space-y-2">
                  <Dumbbell className="h-6 w-6 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">Još nema završenih treninga</p>
                </Card>
              ) : (
                <Card className="divide-y divide-hairline">
                  {sessions.map((s) => (
                    <div key={s.id} className="p-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-gradient-brand-soft text-primary flex items-center justify-center shrink-0">
                        <Dumbbell className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[14px] truncate">
                          {s.assigned_program_days?.name ?? `Dan ${s.day_number}`}
                        </div>
                        <div className="text-[12px] text-muted-foreground truncate">
                          {s.assigned_programs?.name ?? "Program"} · {s.completed_at ? formatDate(s.completed_at) : "—"}
                        </div>
                      </div>
                    </div>
                  ))}
                </Card>
              )}
            </section>
          </>
        ) : (
          <>
            <Card className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Težina
                  </div>
                  <div className="font-display text-[28px] font-bold tracking-tightest mt-1 tnum">
                    {weightSeries.length > 0 ? weightSeries[weightSeries.length - 1].weight_kg : "—"}{" "}
                    <span className="text-[14px] text-muted-foreground font-semibold">kg</span>
                  </div>
                </div>
                {trend && (
                  <span className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold",
                    trend.diff < 0 ? "bg-success-soft text-success-soft-foreground" : "bg-primary-soft text-primary-soft-foreground"
                  )}>
                    {trend.diff < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                    {trend.diff > 0 ? "+" : ""}{trend.diff.toFixed(1)} kg
                  </span>
                )}
              </div>

              {chartPath ? (
                <>
                  <svg viewBox="0 0 280 90" className="w-full h-28" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="wGradFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(252 82% 60%)" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="hsl(252 82% 60%)" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="wGradLine" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="hsl(268 80% 56%)" />
                        <stop offset="100%" stopColor="hsl(252 82% 60%)" />
                      </linearGradient>
                    </defs>
                    <polygon points={chartPath.area} fill="url(#wGradFill)" />
                    <polyline
                      points={chartPath.line}
                      fill="none"
                      stroke="url(#wGradLine)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx={chartPath.lastX} cy={chartPath.lastY} r="4" fill="hsl(252 82% 60%)" />
                  </svg>
                  <div className="flex justify-between mt-2 text-[10px] font-semibold text-muted-foreground tnum">
                    <span>{chartPath.min} kg</span>
                    <span>{chartPath.max} kg</span>
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-muted-foreground text-center py-4">
                  Dodaj bar dva merenja da vidiš grafikon
                </p>
              )}
            </Card>

            <section>
              <div className="flex items-center justify-between mb-2">
                <SectionTitle>Merenja</SectionTitle>
                <button
                  onClick={() => setAddOpen(true)}
                  className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-brand active:scale-95 transition"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>
              {metrics.length === 0 ? (
                <Card className="p-6 text-center space-y-2">
                  <Scale className="h-6 w-6 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">Još nema merenja. Dodaj prvo.</p>
                </Card>
              ) : (
                <Card className="divide-y divide-hairline">
                  {metrics.map((m) => (
                    <div key={m.id} className="p-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-gradient-brand-soft text-primary flex items-center justify-center shrink-0">
                        <Scale className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[14px] tnum">
                          {m.weight_kg ? `${m.weight_kg} kg` : "—"}
                          {m.body_fat_pct ? ` · ${m.body_fat_pct}% masti` : ""}
                        </div>
                        <div className="text-[12px] text-muted-foreground">
                          {formatDate(m.recorded_on)}{m.notes ? ` · ${m.notes}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </Card>
              )}
            </section>

            {user && <ProgressPhotos athleteId={user.id} canManage />}
          </>
        )}

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Novo merenje</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="w">Težina (kg)</Label>
                <Input
                  id="w"
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="npr. 78.5"
                  className="mt-1.5"
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="bf">% telesne masti (opciono)</Label>
                <Input
                  id="bf"
                  inputMode="decimal"
                  value={bodyFat}
                  onChange={(e) => setBodyFat(e.target.value)}
                  placeholder="npr. 18"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="n">Napomena (opciono)</Label>
                <Input
                  id="n"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="npr. ujutru, na prazan stomak"
                  className="mt-1.5"
                />
              </div>
              <Button onClick={saveMetric} disabled={saving} className="w-full">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Sačuvaj
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PhoneShell>
      <BottomNav role="athlete" />
    </>
  );
};

export default Progress;
