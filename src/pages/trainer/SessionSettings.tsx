import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Loader2, Trash2, Pencil, Clock, MinusCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  sessionColors, sessionColorClasses, weekdayLabelsLong, weekdayLabelsShort, formatTime,
} from "@/lib/session";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { ZakljucanaZona } from "@/components/pretplata/ZakljucanaZona";
import { LockMark } from "@/components/pretplata/LockMark";
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
  // Racunar: isti termin odjednom za vise dana.
  const [slotDani, setSlotDani] = useState<number[]>([]);
  // Racunar: da li je raspored bar jednom stigao. Bez toga prazna mreza nije "prazan raspored".
  const [ucitano, setUcitano] = useState(false);
  const [neuspelo, setNeuspelo] = useState(false);
  // Potvrda (z-50) bi na racunaru ostala ispod prozora vrste (z-100), pa se on sakrije dok se pita.
  const [pitam, setPitam] = useState(false);
  // Polje mreze koje se upravo dodaje, da drugi klik ne upise isti termin dvaput.
  const uToku = useRef(new Set<string>());

  const load = async () => {
    if (!user) return;
    // Racunar: osvezavanje posle izmene ne gasi mrezu.
    if (!desktop || !ucitano) setLoading(true);
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
    const greska = tRes.error ?? sRes.error;
    if (greska) {
      toast.error(porukaGreske(greska));
      // Neuspelo citanje ne sme da izgleda kao obrisan raspored: stari podaci ostaju.
      if (desktop) {
        setNeuspelo(!ucitano);
        setLoading(false);
        return;
      }
    }
    const noveVrste = (tRes.data as unknown as SessionType[] | null) ?? [];
    const noviSabloni = (sRes.data as unknown as Template[] | null) ?? [];
    setTypes(noveVrste);
    // Termini arhivirane vrste se ne crtaju, pa ne smeju ni u brojke (kao iOS).
    setTemplates(desktop ? noviSabloni.filter((s) => noveVrste.some((v) => v.id === s.session_type_id)) : noviSabloni);
    setUcitano(true);
    setNeuspelo(false);
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
    const naziv = typeForm.name.trim();
    if (!naziv) { toast.error(desktop ? "Naziv je obavezan." : "Naziv obavezan"); return; }
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
          name: naziv,
          color: typeForm.color,
          capacity,
          duration_min: durationMin,
        } as any)
        .eq("id", editingType.id);
      setSavingType(false);
      if (error) { toast.error(porukaGreske(error)); return; }
      toast.success(desktop ? "Vrsta sačuvana" : "Tip ažuriran");
    } else {
      const { error } = await supabase.from("session_types").insert({
        trainer_id: user.id,
        name: naziv,
        color: typeForm.color,
        capacity,
        duration_min: durationMin,
      } as any);
      setSavingType(false);
      if (error) { toast.error(porukaGreske(error)); return; }
      toast.success(desktop ? "Vrsta sačuvana" : "Tip kreiran");
    }
    setTypeOpen(false);
    load();
  };

  const deleteType = async (t: SessionType) => {
    if (locked) return openLock();
    setPitam(true);
    const ok = await confirm(
      desktop
        ? {
            title: `Obrisati vrstu ${t.name}?`,
            description: "Postojeće rezervacije ostaju, a termini ove vrste nestaju iz rasporeda.",
            confirmLabel: "Obriši",
            destructive: true,
          }
        : { title: `Obrisati tip "${t.name}"?`, description: "Postojeće rezervacije ostaju.", destructive: true },
    );
    setPitam(false);
    if (!ok) return;
    const { error } = await supabase
      .from("session_types")
      .update({ is_archived: true } as any)
      .eq("id", t.id);
    if (error) { toast.error(porukaGreske(error)); return; }
    toast.success(desktop ? "Vrsta obrisana" : "Tip arhiviran");
    setTypeOpen(false);
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
    // Sa dugmeta dana taj dan je vec izabran; sa glavnog dugmeta trener bira sam.
    setSlotDani(weekday != null ? [weekday] : []);
    setSlotOpen(true);
  };

  const postoji = (typeId: string, weekday: number, vreme: string) =>
    templates.some((x) => x.session_type_id === typeId && x.weekday === weekday && formatTime(x.start_time) === vreme);

  // Racunar: jedan upis za sve izabrane dane, pa greska ne ostavlja pola rasporeda.
  // Dan koji taj termin vec ima se samo preskace.
  const submitSlotDani = async () => {
    if (locked) return openLock();
    if (!user || savingSlot) return;
    const vrsta = types.find((t) => t.id === slotForm.session_type_id) ?? types[0];
    if (!vrsta) { toast.error("Prvo napravi vrstu sesije."); return; }
    if (slotDani.length === 0) { toast.error("Izaberi bar jedan dan."); return; }
    const sat = slotForm.start_time.slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(sat)) { toast.error("Izaberi vreme početka."); return; }
    const novi = [...slotDani].sort((a, b) => a - b).filter((d) => !postoji(vrsta.id, d, sat));
    const preskoceno = slotDani.length - novi.length;
    if (novi.length === 0) {
      toast.error(preskoceno === 1 ? "Taj dan već ima ovaj termin." : "Svi izabrani dani već imaju ovaj termin.");
      return;
    }
    setSavingSlot(true);
    const { error } = await supabase.from("session_slot_templates").insert(
      novi.map((weekday) => ({
        trainer_id: user.id,
        session_type_id: vrsta.id,
        weekday,
        start_time: sat,
      })) as any,
    );
    if (error) {
      setSavingSlot(false);
      toast.error(porukaGreske(error));
      return;
    }
    await load();
    setSavingSlot(false);
    // Prozor ostaje otvoren da trener vidi sta je preskoceno, kao na iOS-u.
    if (preskoceno > 0) {
      toast.success(`Dodato ${novi.length}, preskočeno ${preskoceno} jer termin već postoji.`);
      return;
    }
    toast.success(novi.length > 1 ? `Dodato ${novi.length} termina` : "Termin dodat u raspored");
    setSlotOpen(false);
  };

  // Stavka "Dodaj: vrsta" iz menija polja u mrezi.
  const dodajUPolje = async (vrsta: SessionType, weekday: number, vreme: string) => {
    if (locked) return openLock();
    if (!user) return;
    if (postoji(vrsta.id, weekday, vreme)) { toast.error("Taj termin već postoji."); return; }
    const k = `${vrsta.id}|${weekday}|${vreme}`;
    if (uToku.current.has(k)) return;
    uToku.current.add(k);
    const { error } = await supabase.from("session_slot_templates").insert({
      trainer_id: user.id,
      session_type_id: vrsta.id,
      weekday,
      start_time: vreme,
    } as any);
    if (error) toast.error(porukaGreske(error));
    else {
      toast.success("Termin dodat u raspored");
      await load();
    }
    uToku.current.delete(k);
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
    if (!(await confirm(
      desktop
        ? {
            title: "Ukloniti termin iz nedeljnog rasporeda?",
            description: "Već zakazane rezervacije ostaju.",
            confirmLabel: "Ukloni",
            destructive: true,
          }
        : { title: "Ukloniti ovaj termin iz nedeljnog rasporeda?", destructive: true },
    ))) return;
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

  // Redovi mreze na racunaru: svako vreme koje postoji u nedeljnom rasporedu.
  const vremena = useMemo(
    () => Array.from(new Set(templates.map((t) => formatTime(t.start_time)))).sort(),
    [templates],
  );

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
              <LockMark className="mr-1.5" />
              <Plus className="h-4 w-4 mr-1.5" />
              Nova vrsta sesije
            </Button>
            <Button
              onClick={() => openNewSlot()}
              disabled={!locked && types.length === 0}
              className="h-10 rounded-full px-4 bg-gradient-brand text-white shadow-brand"
            >
              <LockMark className="mr-1.5" />
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
      ) : desktop && neuspelo ? (
        <div className="card-premium flex flex-col items-center gap-3 px-8 py-14 text-center">
          <p className="text-[14px] font-semibold">Raspored nije učitan.</p>
          <Button variant="outline" onClick={load} className="h-10 rounded-full px-4">
            Pokušaj ponovo
          </Button>
        </div>
      ) : desktop ? (
        // Racunar: vrste kao mreza kartica, a nedeljni sablon kao mreza vreme x dan,
        // ista kao na iOS-u: klik na polje dodaje ili uklanja vrstu u tom terminu.
        <div className="space-y-8">
          {/* Vrh (Ponoc): koliko termina i mesta nedeljni sablon daje. */}
          {(() => {
            const kap = new Map(types.map((t) => [t.id, t.capacity]));
            const mesta = templates.reduce((s2, x) => s2 + (kap.get(x.session_type_id) ?? 0), 0);
            return (
              <section className="relative flex items-center gap-10 overflow-hidden rounded-[28px] bg-gradient-brand px-7 py-6 text-white shadow-[0_30px_60px_-28px_hsl(267_81%_58%/0.9),inset_0_0_0_1px_hsl(0_0%_100%/0.18)]">
                <span aria-hidden className="absolute -right-16 -top-24 h-80 w-80 rounded-full bg-white/15 blur-[50px]" />
                <div className="relative">
                  <span className="fig block text-[48px] leading-[0.95]">{templates.length}</span>
                  <small className="mt-1.5 block text-[12px] text-white/88">termina nedeljno</small>
                </div>
                <div className="relative">
                  <span className="fig block text-[48px] leading-[0.95]">{mesta}</span>
                  <small className="mt-1.5 block text-[12px] text-white/88">mesta</small>
                </div>
                <div className="relative ml-auto flex flex-wrap justify-end gap-1.5">
                  {types.map((t) => {
                    const n = templates.filter((x) => x.session_type_id === t.id).length;
                    if (n === 0) return null;
                    return (
                      <span key={t.id} className="rounded-full bg-white/20 px-2.5 py-1 text-[11.5px] font-semibold">
                        {t.name} · {n}×
                      </span>
                    );
                  })}
                </div>
              </section>
            );
          })()}
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
                        do {t.capacity} {t.capacity === 1 ? "osobe" : "osoba"}
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
                <span className="flex items-center gap-1.5">
                  <LockMark />
                  <Plus className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold">Nova vrsta sesije</span>
                {types.length === 0 && (
                  <span className="text-[13px] font-normal text-muted-foreground">
                    Nemaš vrste sesija. Dodaj npr. "Personalni trening" ili "Group HIIT".
                  </span>
                )}
              </button>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Raspored</div>
                <div className="font-display text-lg font-bold tracking-tight">Nedeljni šablon</div>
              </div>
              <p className="text-[12px] text-muted-foreground">
                Klikni na polje da dodaš ili ukloniš vrstu u tom terminu.
              </p>
            </div>
            <ZakljucanaZona className="card-premium p-3">
              <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-1.5">
                <span aria-hidden />
                {weekdayLabelsShort.map((dan, wd) => (
                  <button
                    key={dan}
                    type="button"
                    onClick={() => openNewSlot(wd)}
                    disabled={!locked && types.length === 0}
                    aria-label={`Novi termin: ${weekdayLabelsLong[wd]}`}
                    title={`Novi termin: ${weekdayLabelsLong[wd]}`}
                    className="flex h-9 items-center justify-center gap-1 rounded-lg text-[11px] font-semibold tracking-[0.08em] text-muted-foreground transition hover:bg-surface-2 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                  >
                    {dan}
                    <Plus className="h-3 w-3" />
                  </button>
                ))}

                {vremena.length === 0 && (
                  <p className="col-span-full py-8 text-center text-[13px] text-muted-foreground">
                    Nedeljni raspored je prazan. Dodaj prvi termin.
                  </p>
                )}

                {vremena.map((v) => (
                  <Fragment key={v}>
                    <span className="pt-3 text-[11.5px] font-semibold text-muted-foreground tnum">{v}</span>
                    {weekdayLabelsLong.map((danIme, wd) => {
                      // Vise vrsta u istom terminu (npr. personalni i grupni u 18:00) se sve vide.
                      const lista = (templatesByDay.get(wd) ?? []).filter((x) => formatTime(x.start_time) === v);
                      const ostale = types.filter((t) => !lista.some((x) => x.session_type_id === t.id));
                      return (
                        <DropdownMenu key={wd} modal={false}>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`${danIme} ${v}`}
                              className={cn(
                                "group flex min-h-[52px] min-w-0 flex-col gap-1 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                                lista.length === 0 && "items-center justify-center bg-surface-2/60 hover:bg-surface-2",
                              )}
                            >
                              {lista.length === 0 ? (
                                <Plus className="h-3.5 w-3.5 text-muted-foreground/0 transition group-hover:text-muted-foreground group-focus-visible:text-muted-foreground" />
                              ) : (
                                lista.map((x) => {
                                  const vrsta = typeById(x.session_type_id);
                                  if (!vrsta) return null;
                                  const boje = sessionColorClasses(vrsta.color);
                                  return (
                                    <span
                                      key={x.id}
                                      className={cn("block flex-1 rounded-lg border px-2 py-1.5 text-left transition group-hover:brightness-110", boje.bg, boje.border)}
                                    >
                                      <span className={cn("block text-[11.5px] font-semibold leading-tight [overflow-wrap:anywhere]", boje.fg)}>
                                        {vrsta.name}
                                      </span>
                                      <span className="block text-[10.5px] text-muted-foreground tnum">{vrsta.capacity} mesta</span>
                                    </span>
                                  );
                                })
                              )}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="center" className="w-60">
                            {lista.map((x) => (
                              <DropdownMenuItem
                                key={x.id}
                                onSelect={() => deleteSlot(x.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                <MinusCircle className="mr-2 h-4 w-4 shrink-0" />
                                Ukloni: {typeById(x.session_type_id)?.name ?? "Termin"}
                              </DropdownMenuItem>
                            ))}
                            {lista.length > 0 && ostale.length > 0 && <DropdownMenuSeparator />}
                            {ostale.map((t) => (
                              <DropdownMenuItem key={t.id} onSelect={() => dodajUPolje(t, wd, v)}>
                                <Plus className="mr-2 h-4 w-4 shrink-0" />
                                Dodaj: {t.name}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </ZakljucanaZona>
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
                <LockMark className="mr-1" /><Plus className="h-3.5 w-3.5 mr-1" /> Nov
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
              <Button size="sm" onClick={() => openNewSlot()} disabled={!locked && types.length === 0}>
                <LockMark className="mr-1" /><Plus className="h-3.5 w-3.5 mr-1" /> Termin
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
                        disabled={!locked && types.length === 0}
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
        title={desktop ? (editingType ? "Izmeni vrstu" : "Nova vrsta") : (editingType ? "Izmeni tip" : "Nov tip sesije")}
        hidden={pitam}
      >
        <FullScreenSheetScroll className="pt-5 space-y-3">
          <div>
            <label className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">Naziv</label>
            <Input
              placeholder={desktop ? "Personalni trening" : "npr. Personalni trening"}
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
            {desktop || editingType ? "Sačuvaj" : "Kreiraj"}
          </Button>
          {desktop && editingType && (
            <button
              type="button"
              onClick={() => deleteType(editingType)}
              disabled={savingType}
              className="mt-2 h-10 w-full text-[14px] font-semibold text-destructive disabled:opacity-50"
            >
              Obriši vrstu
            </button>
          )}
        </FullScreenSheetFooter>
      </FullScreenSheet>

      {/* Slot sheet */}
      <FullScreenSheet
        open={slotOpen}
        onClose={() => setSlotOpen(false)}
        title={desktop ? "Novi termin" : "Dodaj termin u raspored"}
      >
        <FullScreenSheetScroll className="pt-5 space-y-3">
          {desktop ? (
            <>
              <div>
                <div className="text-[12px] font-semibold text-muted-foreground mb-1.5">Vrsta</div>
                <div role="group" aria-label="Vrsta" className="flex flex-wrap gap-1.5">
                  {types.map((t) => {
                    const izabrana = slotForm.session_type_id === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSlotForm({ ...slotForm, session_type_id: t.id })}
                        aria-pressed={izabrana}
                        className={cn(
                          "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-semibold transition",
                          izabrana
                            ? "border-transparent bg-primary text-primary-foreground"
                            : "border-hairline bg-surface text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <span className={cn("h-2 w-2 rounded-full", sessionColorClasses(t.color).dot)} />
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="text-[12px] font-semibold text-muted-foreground mb-1.5">Dani</div>
                <div role="group" aria-label="Dani" className="grid grid-cols-7 gap-1.5">
                  {weekdayLabelsShort.map((dan, wd) => {
                    const izabran = slotDani.includes(wd);
                    return (
                      <button
                        key={dan}
                        type="button"
                        onClick={() => setSlotDani((d) => (d.includes(wd) ? d.filter((x) => x !== wd) : [...d, wd]))}
                        aria-pressed={izabran}
                        aria-label={weekdayLabelsLong[wd]}
                        className={cn(
                          "h-10 rounded-xl text-[11px] font-semibold transition",
                          izabran
                            ? "bg-gradient-brand text-white"
                            : "border border-hairline bg-surface text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {dan}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label htmlFor="slot-pocetak" className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">Početak</label>
                <Input
                  id="slot-pocetak"
                  type="time"
                  value={slotForm.start_time}
                  onChange={(e) => setSlotForm({ ...slotForm, start_time: e.target.value })}
                  className="h-14 text-base rounded-2xl"
                />
              </div>
            </>
          ) : (
          <>
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
          </>
          )}
        </FullScreenSheetScroll>
        <FullScreenSheetFooter>
          <Button
            className="w-full bg-gradient-brand text-white shadow-brand"
            onClick={desktop ? submitSlotDani : submitSlot}
            disabled={savingSlot}
          >
            {savingSlot && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {desktop && slotDani.length > 1 ? `Dodaj ${slotDani.length} termina` : "Dodaj termin"}
          </Button>
        </FullScreenSheetFooter>
      </FullScreenSheet>
    </PhoneShell>
  );
};

export default SessionSettings;
