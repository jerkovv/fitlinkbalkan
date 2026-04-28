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
  const [streak, setStreak] = useState(0);
  const [weeklyHistory, setWeeklyHistory] = useState<{ label: string; count: number }[]>([]);
  const [trainerName, setTrainerName] = useState<string>("");

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
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Ove nedelje</div>
                <div className="font-display text-[28px] font-bold tracking-tightest mt-1 tnum">{weekCount}</div>
                <div className="text-[12px] text-muted-foreground">treninga</div>
              </Card>
              <Card className="p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Ovog meseca</div>
                <div className="font-display text-[28px] font-bold tracking-tightest mt-1 tnum">{monthCount}</div>
                <div className="text-[12px] text-muted-foreground">treninga</div>
              </Card>
            </div>

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
