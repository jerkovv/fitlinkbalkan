import { useEffect, useMemo, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { Card, Chip } from "@/components/ui-bits";
import { supabase } from "@/lib/supabase";
import { porukaGreske } from "@/lib/errorMessage";
import { useConfirm } from "@/hooks/useConfirm";
import { useAuth } from "@/hooks/useAuth";
import {
  FullScreenSheet,
  FullScreenSheetScroll,
  FullScreenSheetFooter,
} from "@/components/ui/full-screen-sheet";
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
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";

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
  const { locked, openLock } = usePretplataLock();
  const { user } = useAuth();
  const confirm = useConfirm();
  const desktop = useDesktopWeb();
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<SessionType[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  // Type dialog
  const [typeOpen, setTypeOpen] = useState(false);
  const [editingType, setEditingType] = useState<SessionType | null>(null);
  // capacity/duration_min kao TEKST dok se tip edituje (isti obrazac kao Packages.tsx) - broj
  // se parsira tek na submit. Ranije je onChange radio parseInt(e.target.value) || default, sto
  // znaci da svaki put kad polje na trenutak postane prazno (npr. brisanje "60" cifru-po-cifru
  // pre kucanja novog broja - uobicajeno na iOS numerickoj tastaturi bez "clear" dugmeta),
  // parseInt("") daje NaN, NaN || default se ODMAH vraca na default PRE nego sto korisnik stigne
  // da otkuca novu vrednost - polje deluje "zamrznuto"/"samo korak po korak".
  const [typeForm, setTypeForm] = useState({
    name: "", color: "violet", capacity: "1", duration_min: "60",
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
    if (locked) return openLock();
    setEditingType(null);
    setTypeForm({ name: "", color: "violet", capacity: "1", duration_min: "60" });
    setTypeOpen(true);
  };

  const openEditType = (t: SessionType) => {
    if (locked) return openLock();
    setEditingType(t);
    setTypeForm({
      name: t.name,
      color: t.color,
      capacity: String(t.capacity),
      duration_min: String(t.duration_min),
    });
    setTypeOpen(true);
  };

  const submitType = async () => {
    if (locked) return openLock();
    if (!user) return;
    if (!typeForm.name.trim()) { toast.error("Naziv obavezan"); return; }
    // Parsiraj i validiraj TEK ovde (na submit), ne na svaki keystroke - polje ostaje slobodno
    // za kucanje dok se edituje.
    const durationMin = parseInt(typeForm.duration_min, 10);
    const capacity = parseInt(typeForm.capacity, 10);
    if (!Number.isFinite(durationMin) || durationMin < 15) {
      toast.error("Trajanje mora biti bar 15 minuta");
      return;
    }
    if (!Number.isFinite(capacity) || capacity < 1) {
      toast.error("Max broj ljudi mora biti bar 1");
      return;
    }
    setSavingType(true);
    if (editingType) {
      const { error } = await supabase
        .from("session_types")
        .update({
          name: typeForm.name,
          color: typeForm.color,
          capacity,
          duration_min: durationMin,
        } as any)
        .eq("id", editingType.id);
      setSavingType(false);
      if (error) { toast.error(porukaGreske(error)); return; }
      toast.success("Tip ažuriran");
    } else {
      const { error } = await supabase.from("session_types").insert({
        trainer_id: user.id,
        name: typeForm.name,
        color: typeForm.color,
        capacity,
        duration_min: durationMin,
      } as any);
      setSavingType(false);
      if (error) { toast.error(porukaGreske(error)); return; }
      toast.success("Tip kreiran");
    }
    setTypeOpen(false);
    load();
  };

  const deleteType = async (t: SessionType) => {
    if (locked) return openLock();
    if (!(await confirm({ title: `Obrisati tip "${t.name}"?`, description: "Postojeće rezervacije ostaju.", destructive: true }))) return;
    const { error } = await supabase
      .from("session_types")
      .update({ is_archived: true } as any)
      .eq("id", t.id);
    if (error) { toast.error(porukaGreske(error)); return; }
    toast.success("Tip arhiviran");
    load();
  };

  // ===== Slot template CRUD =====
  const openNewSlot = (weekday?: number) => {
    if (locked) return openLock();
    if (types.length === 0) { toast.error("Prvo napravi tip sesije"); return; }
    setSlotForm({
      session_type_id: types[0].id,
      weekday: weekday ?? 0,
      start_time: "08:00",
    });
    setSlotOpen(true);
  };

  const submitSlot = async () => {
    if (locked) return openLock();
    if (!user) return;
    setSavingSlot(true);
    const { error } = await supabase.from("session_slot_templates").insert({
      trainer_id: user.id,
      session_type_id: slotForm.session_type_id,
      weekday: slotForm.weekday,
      start_time: slotForm.start_time,
    } as any);
    setSavingSlot(false);
    if (error) { toast.error(porukaGreske(error)); return; }
    toast.success("Termin dodat u raspored");
    setSlotOpen(false);
    load();
  };

  const deleteSlot = async (id: string) => {
    if (locked) return openLock();
    if (!(await confirm({ title: "Ukloniti ovaj termin iz nedeljnog rasporeda?", destructive: true }))) return;
    const { error } = await supabase.from("session_slot_templates").delete().eq("id", id);
    if (error) { toast.error(porukaGreske(error)); return; }
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
      desktopWidth="wide"
      // Racunar: akcije u zaglavlju, u visini naslova. Telefon ih ima kao mala
      // dugmad iznad svake sekcije.
      action={
        desktop ? (
          <>
            <Button variant="outline" onClick={openNewType} className="h-10 rounded-full px-4">
              <Plus className="h-4 w-4 mr-1.5" />
              Nov tip
            </Button>
            <Button
              onClick={() => openNewSlot()}
              disabled={types.length === 0}
              className="h-10 rounded-full px-4 bg-gradient-brand text-white shadow-brand"
            >
              <Plus className="h-4 w-4 mr-1.5" strokeWidth={2.5} />
              Dodaj termin
            </Button>
          </>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : desktop ? (
        // Racunar: tipovi kao mreza kartica, a nedeljni sablon kao tabla od sedam
        // kolona (pon-ned), kao pravi kalendar. Sedam kartica jedna ispod druge je
        // na sirokom ekranu bilo dugacko i prazno.
        <div className="space-y-8">
          <section>
            <div className="mb-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tipovi</div>
              <div className="font-display text-lg font-bold tracking-tight">Vrste sesija</div>
            </div>
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
              {types.map((t) => {
                const colors = sessionColorClasses(t.color);
                const brojTermina = templates.filter((x) => x.session_type_id === t.id).length;
                return (
                  <div key={t.id} className="group card-premium-hover relative flex min-h-[152px] flex-col p-5">
                    {/* Klik na karticu otvara izmenu; dugmad su iznad njega (z-10). */}
                    <button
                      onClick={() => openEditType(t)}
                      aria-label={`Izmeni tip ${t.name}`}
                      className="absolute inset-0 rounded-[inherit]"
                    />
                    <div className="flex items-start justify-between gap-3">
                      <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", colors.bg)}>
                        <span className={cn("h-2.5 w-2.5 rounded-full", colors.dot)} />
                      </div>
                      <div className="relative z-10 flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                        <button
                          onClick={() => openEditType(t)}
                          aria-label="Izmeni tip"
                          className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteType(t)}
                          aria-label="Obriši tip"
                          className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground transition hover:bg-destructive-soft hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 font-display text-[17px] font-bold leading-snug tracking-tight line-clamp-2">
                      {t.name}
                    </div>
                    <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
                      <span className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground tnum">
                        {t.duration_min} min
                      </span>
                      <span className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground tnum">
                        max {t.capacity} ljudi
                      </span>
                      <span className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-1 text-[11.5px] font-semibold text-primary tnum">
                        {brojTermina}× nedeljno
                      </span>
                    </div>
                  </div>
                );
              })}
              <button
                onClick={openNewType}
                className={cn(
                  "flex min-h-[152px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-hairline px-6 text-center text-muted-foreground transition hover:border-primary hover:text-primary",
                  types.length === 0 && "col-span-2 xl:col-span-3",
                )}
              >
                <Plus className="h-5 w-5" />
                <span className="text-sm font-semibold">Nov tip sesije</span>
                {types.length === 0 && (
                  <span className="text-[13px] font-normal text-muted-foreground">
                    Nemaš tipove sesija. Dodaj npr. "Personalni trening" ili "Group HIIT".
                  </span>
                )}
              </button>
            </div>
          </section>

          <section>
            <div className="mb-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Raspored</div>
              <div className="font-display text-lg font-bold tracking-tight">Nedeljni šablon</div>
            </div>
            <div className="card-premium overflow-hidden">
              <div className="grid grid-cols-7 divide-x divide-hairline">
                {weekdayLabelsLong.map((label, wd) => {
                  const dayTemplates = templatesByDay.get(wd) ?? [];
                  return (
                    <div key={wd} className="flex min-w-0 flex-col">
                      <div className="border-b border-hairline bg-surface-2 px-3 py-2.5">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {weekdayLabelsShort[wd]}
                        </div>
                        <div className="truncate text-[13px] font-semibold">{label}</div>
                      </div>
                      <div className="flex min-h-[260px] flex-1 flex-col gap-1.5 p-2">
                        {dayTemplates.length === 0 ? (
                          <div className="px-1 py-2 text-[12px] italic text-muted-foreground/70">Slobodan dan</div>
                        ) : (
                          dayTemplates.map((tpl) => {
                            const type = typeById(tpl.session_type_id);
                            if (!type) return null;
                            const colors = sessionColorClasses(type.color);
                            return (
                              <div
                                key={tpl.id}
                                className={cn("group relative rounded-lg border px-2.5 py-2", colors.bg, colors.border)}
                              >
                                <div className={cn("font-display text-[14px] font-bold leading-none tnum", colors.fg)}>
                                  {formatTime(tpl.start_time)}
                                </div>
                                <div className="mt-1 truncate text-[11.5px] font-semibold">{type.name}</div>
                                <div className="text-[11px] text-muted-foreground tnum">{type.capacity} mesta</div>
                                <button
                                  onClick={() => deleteSlot(tpl.id)}
                                  aria-label="Ukloni termin"
                                  className="absolute right-1 top-1 h-6 w-6 rounded-full bg-surface flex items-center justify-center text-destructive opacity-0 shadow-sm transition hover:bg-destructive-soft group-hover:opacity-100 focus-visible:opacity-100"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })
                        )}
                        <button
                          onClick={() => openNewSlot(wd)}
                          disabled={types.length === 0}
                          className="mt-auto flex items-center justify-center gap-1 rounded-lg border border-dashed border-hairline py-2 text-[12px] font-semibold text-muted-foreground transition hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                        >
                          <Plus className="h-3.5 w-3.5" /> Dodaj
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
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

      {/* Type sheet */}
      <FullScreenSheet
        open={typeOpen}
        onClose={() => setTypeOpen(false)}
        title={editingType ? "Izmeni tip" : "Nov tip sesije"}
      >
        <FullScreenSheetScroll className="pt-5 space-y-3">
          <div>
            <label className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">Naziv</label>
            <Input
              placeholder="npr. Personalni trening"
              value={typeForm.name}
              onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
              className="h-14 text-base rounded-2xl"
              autoFocus
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
                inputMode="numeric"
                value={typeForm.duration_min}
                onChange={(e) => setTypeForm({ ...typeForm, duration_min: e.target.value })}
                className="h-14 text-base rounded-2xl"
              />
            </div>
            <div>
              <label className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">Max ljudi</label>
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                value={typeForm.capacity}
                onChange={(e) => setTypeForm({ ...typeForm, capacity: e.target.value })}
                className="h-14 text-base rounded-2xl"
              />
            </div>
          </div>
        </FullScreenSheetScroll>
        <FullScreenSheetFooter>
          <Button className="w-full bg-gradient-brand text-white shadow-brand" onClick={submitType} disabled={savingType}>
            {savingType && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editingType ? "Sačuvaj" : "Kreiraj"}
          </Button>
        </FullScreenSheetFooter>
      </FullScreenSheet>

      {/* Slot sheet */}
      <FullScreenSheet open={slotOpen} onClose={() => setSlotOpen(false)} title="Dodaj termin u raspored">
        <FullScreenSheetScroll className="pt-5 space-y-3">
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
              className="h-14 text-base rounded-2xl"
            />
          </div>
        </FullScreenSheetScroll>
        <FullScreenSheetFooter>
          <Button className="w-full bg-gradient-brand text-white shadow-brand" onClick={submitSlot} disabled={savingSlot}>
            {savingSlot && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Dodaj termin
          </Button>
        </FullScreenSheetFooter>
      </FullScreenSheet>
    </PhoneShell>
  );
};

export default SessionSettings;
