import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card, Chip } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft, ChevronRight, Plus, Loader2, MapPin, Trash2, CheckCircle2, Activity, Calendar as CalIcon,
} from "lucide-react";
import { toast } from "sonner";

const dayHeaders = ["P", "U", "S", "Č", "P", "S", "N"];
const monthNames = [
  "Januar", "Februar", "Mart", "April", "Maj", "Jun",
  "Jul", "Avgust", "Septembar", "Oktobar", "Novembar", "Decembar",
];

type Session = {
  id: string;
  athlete_id: string;
  scheduled_at: string;
  duration_min: number;
  location: string | null;
  notes: string | null;
  status: string;
};

type WorkoutLog = {
  id: string;
  athlete_id: string;
  day_number: number;
  completed_at: string;
  duration_seconds: number | null;
};

type AthleteOption = { id: string; full_name: string | null };

// Build month grid: array of { date, inMonth } starting from Monday
const buildMonthGrid = (year: number, month: number) => {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  // Monday=0..Sunday=6
  const startWeekday = (first.getDay() + 6) % 7;
  const cells: { date: Date; inMonth: boolean }[] = [];
  // leading days from prev month
  for (let i = startWeekday; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    cells.push({ date: d, inMonth: false });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  // trailing
  while (cells.length % 7 !== 0) {
    const i = cells.length - (startWeekday + last.getDate());
    cells.push({ date: new Date(year, month + 1, i + 1), inMonth: false });
  }
  // Ensure 6 rows for stable height
  while (cells.length < 42) {
    const i = cells.length - (startWeekday + last.getDate());
    cells.push({ date: new Date(year, month + 1, i + 1), inMonth: false });
  }
  return cells;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const toIsoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const Calendar = () => {
  const { user } = useAuth();
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date>(today);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [athletes, setAthletes] = useState<AthleteOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Add dialog
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    athlete_id: "",
    date: toIsoDate(today),
    time: "10:00",
    duration_min: 60,
    location: "",
    notes: "",
  });

  // Range = whole visible month + buffer for adjacent days shown in grid
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const startISO = new Date(monthStart.getTime() - 7 * 86400000).toISOString();
    const endISO = new Date(monthEnd.getTime() + 7 * 86400000).toISOString();

    const [sRes, lRes, aRes] = await Promise.all([
      supabase
        .from("trainer_sessions")
        .select("id, athlete_id, scheduled_at, duration_min, location, notes, status")
        .eq("trainer_id", user.id)
        .gte("scheduled_at", startISO)
        .lte("scheduled_at", endISO)
        .order("scheduled_at"),
      supabase
        .from("workout_session_logs")
        .select("id, athlete_id, day_number, completed_at, duration_seconds")
        .not("completed_at", "is", null)
        .gte("completed_at", startISO)
        .lte("completed_at", endISO),
      supabase
        .from("athletes")
        .select("id")
        .eq("trainer_id", user.id),
    ]);

    setSessions((sRes.data as any) ?? []);
    setLogs((lRes.data as any) ?? []);

    const ids = ((aRes.data as any[]) ?? []).map((a) => a.id);
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      setAthletes(((profs as any[]) ?? []).map((p) => ({ id: p.id, full_name: p.full_name })));
    } else {
      setAthletes([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [user, cursor.getFullYear(), cursor.getMonth()]);

  const cells = useMemo(
    () => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()),
    [cursor],
  );

  // Day → activity counts
  const activityByDay = useMemo(() => {
    const map = new Map<string, { sessions: number; workouts: number }>();
    sessions.forEach((s) => {
      const k = toIsoDate(new Date(s.scheduled_at));
      const cur = map.get(k) ?? { sessions: 0, workouts: 0 };
      cur.sessions++;
      map.set(k, cur);
    });
    logs.forEach((l) => {
      const k = toIsoDate(new Date(l.completed_at));
      const cur = map.get(k) ?? { sessions: 0, workouts: 0 };
      cur.workouts++;
      map.set(k, cur);
    });
    return map;
  }, [sessions, logs]);

  const athleteName = (id: string) =>
    athletes.find((a) => a.id === id)?.full_name ?? "Vežbač";

  const selectedKey = toIsoDate(selected);
  const daySessions = sessions
    .filter((s) => toIsoDate(new Date(s.scheduled_at)) === selectedKey)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const dayWorkouts = logs
    .filter((l) => toIsoDate(new Date(l.completed_at)) === selectedKey)
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at));

  const openAdd = () => {
    setForm({
      athlete_id: athletes[0]?.id ?? "",
      date: toIsoDate(selected),
      time: "10:00",
      duration_min: 60,
      location: "",
      notes: "",
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!user) return;
    if (!form.athlete_id) { toast.error("Izaberi vežbača"); return; }
    setSaving(true);
    const scheduled = new Date(`${form.date}T${form.time}:00`);
    const { error } = await supabase.from("trainer_sessions").insert({
      trainer_id: user.id,
      athlete_id: form.athlete_id,
      scheduled_at: scheduled.toISOString(),
      duration_min: form.duration_min,
      location: form.location || null,
      notes: form.notes || null,
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Sesija zakazana");
    setOpen(false);
    load();
  };

  const markDone = async (id: string) => {
    const { error } = await supabase
      .from("trainer_sessions")
      .update({ status: "done" } as any)
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Sesija označena kao završena");
    load();
  };

  const removeSession = async (id: string) => {
    if (!confirm("Obrisati zakazanu sesiju?")) return;
    const { error } = await supabase.from("trainer_sessions").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Sesija obrisana");
    load();
  };

  const monthLabel = `${monthNames[cursor.getMonth()]} ${cursor.getFullYear()}`;

  return (
    <>
      <PhoneShell
        hasBottomNav
        title="Kalendar"
        eyebrow={monthLabel}
        rightSlot={
          <button
            onClick={openAdd}
            className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-brand active:scale-95 transition"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
          </button>
        }
      >
        {/* Month grid */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="h-8 w-8 rounded-full hover:bg-surface-2 flex items-center justify-center"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => { const t = new Date(); setCursor(new Date(t.getFullYear(), t.getMonth(), 1)); setSelected(t); }}
              className="text-[13px] font-semibold text-muted-foreground hover:text-foreground transition"
            >
              Danas
            </button>
            <button
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="h-8 w-8 rounded-full hover:bg-surface-2 flex items-center justify-center"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {dayHeaders.map((d, i) => (
              <div key={i} className="aspect-square flex items-center justify-center text-[11px] font-semibold text-muted-foreground/60">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c, i) => {
              const key = toIsoDate(c.date);
              const act = activityByDay.get(key);
              const isToday = sameDay(c.date, today);
              const isSelected = sameDay(c.date, selected);
              return (
                <button
                  key={i}
                  onClick={() => setSelected(c.date)}
                  className={cn(
                    "aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 text-[13px] font-semibold transition relative",
                    !c.inMonth && "text-muted-foreground/30",
                    c.inMonth && !isSelected && !isToday && "text-foreground/80 hover:bg-surface-2",
                    isToday && !isSelected && "text-primary",
                    isSelected && "bg-gradient-brand text-primary-foreground shadow-brand",
                  )}
                >
                  <span>{c.date.getDate()}</span>
                  {act && (
                    <span className="flex gap-0.5">
                      {act.sessions > 0 && (
                        <span className={cn("h-1 w-1 rounded-full", isSelected ? "bg-primary-foreground" : "bg-primary")} />
                      )}
                      {act.workouts > 0 && (
                        <span className={cn("h-1 w-1 rounded-full", isSelected ? "bg-primary-foreground" : "bg-success")} />
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] mt-3 pt-3 border-t border-hairline">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-primary" /> zakazana sesija
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-success" /> završen trening
            </span>
          </div>
        </Card>

        {/* Selected day */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="eyebrow text-muted-foreground">
                {sameDay(selected, today) ? "Danas" : selected.toLocaleDateString("sr-RS", { weekday: "long" })}
              </div>
              <div className="font-display text-lg font-bold">
                {selected.toLocaleDateString("sr-RS", { day: "numeric", month: "long" })}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Sesija
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : daySessions.length === 0 && dayWorkouts.length === 0 ? (
            <Card className="p-6 text-center text-[13px] text-muted-foreground">
              <CalIcon className="h-6 w-6 mx-auto mb-2 text-muted-foreground/50" />
              Nema aktivnosti za ovaj dan.
            </Card>
          ) : (
            <div className="space-y-2">
              {daySessions.map((s) => {
                const time = new Date(s.scheduled_at).toLocaleTimeString("sr-RS", {
                  hour: "2-digit", minute: "2-digit",
                });
                const isDone = s.status === "done";
                return (
                  <Card key={s.id} className="p-3.5">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center shrink-0 w-12">
                        <div className="text-[15px] font-bold tracking-tight">{time}</div>
                        <div className="text-[10px] text-muted-foreground">{s.duration_min}min</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/trener/vezbac/${s.athlete_id}`}
                          className="font-semibold text-[14px] hover:text-primary transition"
                        >
                          {athleteName(s.athlete_id)}
                        </Link>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {isDone && <Chip tone="success">Završeno</Chip>}
                          {!isDone && <Chip tone="info">Zakazano</Chip>}
                        </div>
                        {s.location && (
                          <div className="text-[11.5px] text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3" /> {s.location}
                          </div>
                        )}
                        {s.notes && (
                          <div className="text-[12px] text-muted-foreground mt-1">{s.notes}</div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        {!isDone && (
                          <button
                            onClick={() => markDone(s.id)}
                            className="h-8 w-8 rounded-full hover:bg-success-soft flex items-center justify-center"
                            title="Označi završeno"
                          >
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          </button>
                        )}
                        <button
                          onClick={() => removeSession(s.id)}
                          className="h-8 w-8 rounded-full hover:bg-destructive-soft flex items-center justify-center"
                          title="Obriši"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}

              {dayWorkouts.map((w) => {
                const time = new Date(w.completed_at).toLocaleTimeString("sr-RS", {
                  hour: "2-digit", minute: "2-digit",
                });
                return (
                  <Card key={w.id} className="p-3.5">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-success-soft text-success-soft-foreground flex items-center justify-center shrink-0">
                        <Activity className="h-4 w-4" strokeWidth={2.25} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/trener/vezbac/${w.athlete_id}`}
                          className="font-semibold text-[14px] hover:text-primary transition"
                        >
                          {athleteName(w.athlete_id)}
                        </Link>
                        <div className="text-[11.5px] text-muted-foreground">
                          Završio Dan {w.day_number} u {time}
                          {w.duration_seconds ? ` · ${Math.round(w.duration_seconds / 60)} min` : ""}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </PhoneShell>
      <BottomNav role="trainer" active="kalendar" />

      {/* Add session dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Zakaži sesiju</DialogTitle>
          </DialogHeader>

          {athletes.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              Nemaš nijednog vežbača. Pošalji invite link prvo.
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">Vežbač</label>
                <Select
                  value={form.athlete_id}
                  onValueChange={(v) => setForm({ ...form, athlete_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Izaberi vežbača" /></SelectTrigger>
                  <SelectContent>
                    {athletes.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.full_name ?? "Bez imena"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">Datum</label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">Vreme</label>
                  <Input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">Trajanje (min)</label>
                <Input
                  type="number"
                  min={15}
                  step={15}
                  value={form.duration_min}
                  onChange={(e) => setForm({ ...form, duration_min: parseInt(e.target.value) || 60 })}
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">Lokacija (opciono)</label>
                <Input
                  placeholder="npr. Teretana XYZ"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">Beleška (opciono)</label>
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>

              <Button className="w-full" onClick={submit} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Zakaži sesiju
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Calendar;
