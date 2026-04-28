import { useEffect, useMemo, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { Card, Chip } from "@/components/ui-bits";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Loader2, Trash2, Pencil, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  sessionColors, sessionColorClasses, weekdayLabelsLong, weekdayLabelsShort, formatTime,
} from "@/lib/session";

type SessionType = {
  id: string;
  name: string;
  color: string;
  capacity: number;
  duration_min: number;
  is_archived: boolean;
};

type Template = {
  id: string;
  session_type_id: string;
  weekday: number;
  start_time: string;
};

const SessionSettings = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<SessionType[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  // Type dialog
  const [typeOpen, setTypeOpen] = useState(false);
  const [editingType, setEditingType] = useState<SessionType | null>(null);
  const [typeForm, setTypeForm] = useState({
    name: "", color: "violet", capacity: 1, duration_min: 60,
  });
  const [savingType, setSavingType] = useState(false);

  // Slot dialog
  const [slotOpen, setSlotOpen] = useState(false);
  const [slotForm, setSlotForm] = useState({
    session_type_id: "",
    weekday: 0,
    start_time: "08:00",
  });
  const [savingSlot, setSavingSlot] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [tRes, sRes] = await Promise.all([
      supabase
        .from("session_types")
        .select("id, name, color, capacity, duration_min, is_archived")
        .eq("trainer_id", user.id)
        .eq("is_archived", false)
        .order("created_at"),
      supabase
        .from("session_slot_templates")
        .select("id, session_type_id, weekday, start_time")
        .eq("trainer_id", user.id)
        .eq("is_active", true)
        .order("weekday")
        .order("start_time"),
    ]);
    setTypes((tRes.data as any) ?? []);
    setTemplates((sRes.data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  // ===== Type CRUD =====
  const openNewType = () => {
    setEditingType(null);
    setTypeForm({ name: "", color: "violet", capacity: 1, duration_min: 60 });
    setTypeOpen(true);
  };

  const openEditType = (t: SessionType) => {
    setEditingType(t);
    setTypeForm({ name: t.name, color: t.color, capacity: t.capacity, duration_min: t.duration_min });
    setTypeOpen(true);
  };

  const submitType = async () => {
    if (!user) return;
    if (!typeForm.name.trim()) { toast.error("Naziv obavezan"); return; }
    setSavingType(true);
    if (editingType) {
      const { error } = await supabase
        .from("session_types")
        .update({
          name: typeForm.name,
          color: typeForm.color,
          capacity: typeForm.capacity,
          duration_min: typeForm.duration_min,
        } as any)
        .eq("id", editingType.id);
      setSavingType(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Tip ažuriran");
    } else {
      const { error } = await supabase.from("session_types").insert({
        trainer_id: user.id,
        name: typeForm.name,
        color: typeForm.color,
        capacity: typeForm.capacity,
        duration_min: typeForm.duration_min,
      } as any);
      setSavingType(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Tip kreiran");
    }
    setTypeOpen(false);
    load();
  };

  const deleteType = async (t: SessionType) => {
    if (!confirm(`Obrisati tip "${t.name}"? Postojeće rezervacije ostaju.`)) return;
    const { error } = await supabase
      .from("session_types")
      .update({ is_archived: true } as any)
      .eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Tip arhiviran");
    load();
  };

  // ===== Slot template CRUD =====
  const openNewSlot = (weekday?: number) => {
    if (types.length === 0) { toast.error("Prvo napravi tip sesije"); return; }
    setSlotForm({
      session_type_id: types[0].id,
      weekday: weekday ?? 0,
      start_time: "08:00",
    });
    setSlotOpen(true);
  };

  const submitSlot = async () => {
    if (!user) return;
    setSavingSlot(true);
    const { error } = await supabase.from("session_slot_templates").insert({
      trainer_id: user.id,
      session_type_id: slotForm.session_type_id,
      weekday: slotForm.weekday,
      start_time: slotForm.start_time,
    } as any);
    setSavingSlot(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Termin dodat u raspored");
    setSlotOpen(false);
    load();
  };

  const deleteSlot = async (id: string) => {
    if (!confirm("Ukloniti ovaj termin iz nedeljnog rasporeda?")) return;
    const { error } = await supabase.from("session_slot_templates").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Termin uklonjen");
    load();
  };

  // Group templates by weekday
  const templatesByDay = useMemo(() => {
    const map = new Map<number, Template[]>();
    for (let i = 0; i < 7; i++) map.set(i, []);
    templates.forEach((t) => map.get(t.weekday)?.push(t));
    return map;
  }, [templates]);

  const typeById = (id: string) => types.find((t) => t.id === id);

  return (
    <PhoneShell
      back="/trener"
      title="Termini"
      eyebrow="Podešavanja rasporeda"
    >
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Session types */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="eyebrow text-muted-foreground">Tipovi</div>
                <div className="font-display text-lg font-bold">Vrste sesija</div>
              </div>
              <Button size="sm" variant="outline" onClick={openNewType}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Nov
              </Button>
            </div>

            {types.length === 0 ? (
              <Card className="p-5 text-center text-[13px] text-muted-foreground">
                Nemaš tipove sesija. Dodaj npr. "Personalni trening" ili "Group HIIT".
              </Card>
            ) : (
              <ul className="space-y-1.5">
                {types.map((t) => {
                  const colors = sessionColorClasses(t.color);
                  return (
                    <li
                      key={t.id}
                      className="flex items-center gap-3 p-3 rounded-2xl bg-surface border border-hairline"
                    >
                      <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", colors.bg)}>
                        <span className={cn("h-2 w-2 rounded-full", colors.dot)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[14px] truncate">{t.name}</div>
                        <div className="text-[11.5px] text-muted-foreground tnum">
                          {t.duration_min}min · max {t.capacity} ljudi
                        </div>
                      </div>
                      <button
                        onClick={() => openEditType(t)}
                        className="h-8 w-8 rounded-full hover:bg-surface-2 flex items-center justify-center text-muted-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteType(t)}
                        className="h-8 w-8 rounded-full hover:bg-destructive-soft flex items-center justify-center text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Weekly schedule */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="eyebrow text-muted-foreground">Raspored</div>
                <div className="font-display text-lg font-bold">Nedeljni šablon</div>
              </div>
              <Button size="sm" onClick={() => openNewSlot()} disabled={types.length === 0}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Termin
              </Button>
            </div>

            <div className="space-y-2">
              {weekdayLabelsLong.map((label, wd) => {
                const dayTemplates = templatesByDay.get(wd) ?? [];
                return (
                  <Card key={wd} className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] font-bold tracking-wider text-muted-foreground bg-surface-2 px-2 py-0.5 rounded">
                          {weekdayLabelsShort[wd]}
                        </div>
                        <div className="font-semibold text-[13px]">{label}</div>
                      </div>
                      <button
                        onClick={() => openNewSlot(wd)}
                        disabled={types.length === 0}
                        className="h-7 w-7 rounded-full hover:bg-surface-2 flex items-center justify-center text-muted-foreground disabled:opacity-30"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {dayTemplates.length === 0 ? (
                      <div className="text-[12px] text-muted-foreground/70 italic px-1">
                        Slobodan dan
                      </div>
                    ) : (
                      <ul className="space-y-1">
                        {dayTemplates.map((tpl) => {
                          const type = typeById(tpl.session_type_id);
                          if (!type) return null;
                          const colors = sessionColorClasses(type.color);
                          return (
                            <li
                              key={tpl.id}
                              className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-surface-2"
                            >
                              <Clock className={cn("h-3.5 w-3.5", colors.fg)} />
                              <span className="font-display font-bold text-[14px] tnum">
                                {formatTime(tpl.start_time)}
                              </span>
                              <span className="text-[12px] text-muted-foreground flex-1 truncate">
                                {type.name} · {type.capacity} mesta
                              </span>
                              <button
                                onClick={() => deleteSlot(tpl.id)}
                                className="h-6 w-6 rounded-full hover:bg-destructive-soft flex items-center justify-center text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* Type dialog */}
      <Dialog open={typeOpen} onOpenChange={setTypeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingType ? "Izmeni tip" : "Nov tip sesije"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">Naziv</label>
              <Input
                placeholder="npr. Personalni trening"
                value={typeForm.name}
                onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">Boja</label>
              <div className="flex gap-2 flex-wrap">
                {sessionColors.map((c) => {
                  const colors = sessionColorClasses(c.value);
                  const active = typeForm.color === c.value;
                  return (
                    <button
                      key={c.value}
                      onClick={() => setTypeForm({ ...typeForm, color: c.value })}
                      className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center transition",
                        colors.bg,
                        active ? "ring-2 ring-foreground ring-offset-2" : "hover:scale-110",
                      )}
                      title={c.label}
                    >
                      <span className={cn("h-3 w-3 rounded-full", colors.dot)} />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">Trajanje (min)</label>
                <Input
                  type="number"
                  min={15}
                  step={15}
                  value={typeForm.duration_min}
                  onChange={(e) => setTypeForm({ ...typeForm, duration_min: parseInt(e.target.value) || 60 })}
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">Max ljudi</label>
                <Input
                  type="number"
                  min={1}
                  value={typeForm.capacity}
                  onChange={(e) => setTypeForm({ ...typeForm, capacity: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
            <Button className="w-full" onClick={submitType} disabled={savingType}>
              {savingType && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingType ? "Sačuvaj" : "Kreiraj"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Slot dialog */}
      <Dialog open={slotOpen} onOpenChange={setSlotOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dodaj termin u raspored</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">Tip</label>
              <Select
                value={slotForm.session_type_id}
                onValueChange={(v) => setSlotForm({ ...slotForm, session_type_id: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.duration_min}min · {t.capacity} ljudi)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">Dan u nedelji</label>
              <Select
                value={String(slotForm.weekday)}
                onValueChange={(v) => setSlotForm({ ...slotForm, weekday: parseInt(v) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {weekdayLabelsLong.map((label, i) => (
                    <SelectItem key={i} value={String(i)}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">Vreme početka</label>
              <Input
                type="time"
                value={slotForm.start_time}
                onChange={(e) => setSlotForm({ ...slotForm, start_time: e.target.value })}
              />
            </div>
            <Button className="w-full" onClick={submitSlot} disabled={savingSlot}>
              {savingSlot && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Dodaj termin
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PhoneShell>
  );
};

export default SessionSettings;
