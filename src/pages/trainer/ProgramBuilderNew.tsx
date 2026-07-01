import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useConfirm } from "@/hooks/useConfirm";
import { assignProgramToAthlete } from "@/lib/programAssignment";
import { PhoneShell } from "@/components/PhoneShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  FullScreenSheet,
  FullScreenSheetScroll,
  FullScreenSheetFooter,
} from "@/components/ui/full-screen-sheet";
import {
  Plus, Loader2, Dumbbell, Trash2, GripVertical, ChevronDown, ChevronUp, UserPlus, Check, Send, X, Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { ExercisePickerSheet } from "@/components/exercises/ExercisePickerSheet";
import { muscleIcon } from "@/lib/muscleIcons";

type Day = { id: string; day_number: number; name: string; notes: string | null };
type Exercise = {
  id: string;
  exercise_id: string;
  position: number;
  sets: number;
  reps: string;
  weight_kg: number | null;
  // Vezbe trcanja/hodanja (exercises.is_duration_based) se unose i prikazuju u minutima.
  duration_minutes: number | null;
  rest_seconds: number | null;
  notes: string | null;
  exercises: { name: string; name_en: string | null; primary_muscle: string; is_duration_based: boolean | null; thumbnail_url: string | null } | null;
};
// Per-set cilj (izvor istine). id je DB id ili privremeni (React key); ne salje se u upsert.
type SetRow = {
  id: string;
  set_number: number;
  reps: string;
  weight_kg: number | null;
  rest_seconds: number | null;
};
type Athlete = { id: string; full_name: string | null; email: string };

type ProgramBuilderMode = "template" | "assigned";

const ProgramBuilder = ({ mode = "template" }: { mode?: ProgramBuilderMode }) => {
  const params = useParams<{ id?: string; assignedId?: string; athleteId?: string }>();
  // parentId = template_id (sablon) ili assigned_program_id (dodeljeni plan).
  const parentId = mode === "assigned" ? params.assignedId : params.id;
  const athleteId = params.athleteId;
  // Config sloj: sve tabele/kolone/strategija brisanja izvedene iz moda.
  const cfg = mode === "assigned"
    ? {
        parentTable: "assigned_programs",
        daysTable: "assigned_program_days",
        exTable: "assigned_program_exercises",
        parentCol: "assigned_program_id",
        setsTable: "assigned_program_exercise_sets",
        setsFk: "assigned_exercise_id",
        softDelete: true,
      } as const
    : {
        parentTable: "program_templates",
        daysTable: "program_template_days",
        exTable: "program_template_exercises",
        parentCol: "template_id",
        setsTable: "program_template_exercise_sets",
        setsFk: "template_exercise_id",
        softDelete: false,
      } as const;
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [templateName, setTemplateName] = useState("");
  const [days, setDays] = useState<Day[]>([]);
  const [exByDay, setExByDay] = useState<Record<string, Exercise[]>>({});
  // Per-set redovi po vezbi (parent ex.id -> sortirani set redovi). Izvor istine za editor.
  const [setsByEx, setSetsByEx] = useState<Record<string, SetRow[]>>({});
  const [openDay, setOpenDay] = useState<string | null>(null);
  // Otvorena (expand) vezba za per-set editor; "napredno" (Pauza) toggle po vezbi.
  const [openExId, setOpenExId] = useState<string | null>(null);
  const [advancedByEx, setAdvancedByEx] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  // Add day dialog
  const [addDayOpen, setAddDayOpen] = useState(false);
  const [newDayName, setNewDayName] = useState("");

  // Add exercise picker
  const [pickerDayId, setPickerDayId] = useState<string | null>(null);

  // Assign dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [notifying, setNotifying] = useState(false);

  const load = async () => {
    if (!parentId) return;
    setLoading(true);

    let daysQ = supabase.from(cfg.daysTable).select("*").eq(cfg.parentCol, parentId);
    if (cfg.softDelete) daysQ = daysQ.is("deleted_at", null);

    const [{ data: tpl }, { data: daysData }] = await Promise.all([
      supabase.from(cfg.parentTable).select("name").eq("id", parentId).maybeSingle(),
      daysQ.order("day_number"),
    ]);
    setTemplateName((tpl as any)?.name ?? "Program");
    const dList = (daysData as any) ?? [];
    setDays(dList);

    if (dList.length) {
      const dayIds = dList.map((d: any) => d.id);
      let exQ = supabase
        .from(cfg.exTable)
        .select("*, exercises(name, name_en, primary_muscle, is_duration_based, thumbnail_url)")
        .in("day_id", dayIds);
      if (cfg.softDelete) exQ = exQ.is("deleted_at", null);
      const { data: exs } = await exQ.order("position");
      const exList = (exs as any[]) ?? [];
      const grouped: Record<string, Exercise[]> = {};
      exList.forEach((e: Exercise) => {
        const k = (e as any).day_id;
        grouped[k] = grouped[k] ?? [];
        grouped[k].push(e);
      });
      setExByDay(grouped);

      // Per-set redovi za sve vezbe dana (sort set_number). Vezbe bez redova (legacy / nove
      // jos bez upisa) -> init iz parent sazetka; cardio (is_duration_based) preskace (koristi minute).
      const exIds = exList.map((e) => e.id);
      const setsNext: Record<string, SetRow[]> = {};
      if (exIds.length) {
        const { data: setRows } = await supabase
          .from(cfg.setsTable as any)
          .select("*")
          .in(cfg.setsFk, exIds)
          .order("set_number", { ascending: true });
        for (const s of ((setRows as any[]) ?? [])) {
          const fk = s[cfg.setsFk] as string;
          (setsNext[fk] ??= []).push({
            id: s.id, set_number: s.set_number, reps: s.reps ?? "",
            weight_kg: s.weight_kg, rest_seconds: s.rest_seconds,
          });
        }
      }
      for (const e of exList) {
        if (e.exercises?.is_duration_based) continue;
        if (!setsNext[e.id]?.length) {
          const n = Math.max(1, e.sets ?? 1);
          setsNext[e.id] = Array.from({ length: n }, (_, i) => ({
            id: crypto.randomUUID(), set_number: i + 1,
            reps: e.reps ?? "", weight_kg: e.weight_kg, rest_seconds: e.rest_seconds,
          }));
        }
      }
      setSetsByEx(setsNext);
      if (!openDay) setOpenDay(dList[0].id);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [parentId]);

  const handleAddDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentId) return;
    const nextNum = (days[days.length - 1]?.day_number ?? 0) + 1;
    const { error } = await supabase.from(cfg.daysTable).insert({
      [cfg.parentCol]: parentId,
      day_number: nextNum,
      name: newDayName || `Dan ${nextNum}`,
    } as any);
    if (error) { toast.error(error.message); return; }
    setAddDayOpen(false);
    setNewDayName("");
    toast.success("Dan dodat");
    load();
  };

  const handleDeleteDay = async (dayId: string) => {
    if (!(await confirm({ title: "Obrisati dan?", description: "Dan i sve njegove vežbe biće obrisani.", destructive: true }))) return;
    // Assigned: SOFT delete (CASCADE bi pobrisao set_logs/workout_session_logs = istoriju).
    const { error } = cfg.softDelete
      ? await supabase.from(cfg.daysTable).update({ deleted_at: new Date().toISOString() } as any).eq("id", dayId)
      : await supabase.from(cfg.daysTable).delete().eq("id", dayId);
    if (error) { toast.error(error.message); return; }
    toast.success("Dan obrisan");
    load();
  };

  const openExercisePicker = (dayId: string) => {
    setPickerDayId(dayId);
  };

  // Brisanje celog SABLONA (samo template mod). CASCADE brise dane+vezbe;
  // assigned_programs.source_template_id -> SET NULL (dodeljeni zadrzavaju kopiju).
  const handleDeleteProgram = async () => {
    if (mode !== "template" || !parentId) return;
    if (!(await confirm({
      title: "Obrisati program?",
      description: "Program ce biti trajno obrisan. Vezbaci kojima je dodeljen zadrzavaju svoju kopiju.",
      destructive: true,
    }))) return;
    const { error } = await supabase.from("program_templates").delete().eq("id", parentId);
    if (error) { toast.error(error.message); return; }
    toast.success("Program obrisan");
    navigate("/trener/programi");
  };

  const updateExercise = async (exId: string, patch: Partial<Exercise>) => {
    const { error } = await supabase.from(cfg.exTable).update(patch as any).eq("id", exId);
    if (error) { toast.error(error.message); return; }
    load();
  };

  // Snimanje per-set redova jedne vezbe (auto, onBlur) ATOMICNO preko RPC-a
  // save_exercise_sets: server radi upsert + brisanje viska + renumeraciju 1..n (po REDOSLEDU
  // u p_sets) + sync parenta (sets/reps/weight_kg) u jednoj transakciji. FE ne dira parent
  // ni viskove. Redosled p_sets = redosled setova; id i set_number se NE salju (server dodeljuje).
  // (Bez load() na uspeh - lokalni setsByEx je vec azuriran optimisticki, da input ne treperi.)
  const saveSets = async (exId: string, rows: SetRow[]) => {
    const p_sets = rows.map((r) => ({
      reps: r.reps?.trim() ? r.reps.trim() : null,
      weight_kg: r.weight_kg,
      rest_seconds: r.rest_seconds,
      notes: null,
    }));
    const { data, error } = await supabase.rpc("save_exercise_sets" as any, {
      p_scope: mode,            // "template" | "assigned"
      p_exercise_id: exId,
      p_sets: p_sets,
    } as any);
    if (error || (data && (data as any).success === false)) {
      toast.error(error?.message ?? (data as any)?.error ?? "Greška pri snimanju setova");
      load();   // revert: RPC je atomican -> neuspeh = nepromenjeno; ponovo ucitaj iz baze
    }
  };

  // Optimisticki lokalni update + snimanje (bez reload-a na uspeh, fokus/unos ostaju).
  const applySets = (exId: string, rows: SetRow[]) => {
    setSetsByEx((prev) => ({ ...prev, [exId]: rows }));
    void saveSets(exId, rows);
  };

  const removeExercise = async (exId: string) => {
    // Assigned: SOFT delete (set_logs ima CASCADE -> pravi DELETE bi pobrisao istoriju serija).
    const { error } = cfg.softDelete
      ? await supabase.from(cfg.exTable).update({ deleted_at: new Date().toISOString() } as any).eq("id", exId)
      : await supabase.from(cfg.exTable).delete().eq("id", exId);
    if (error) { toast.error(error.message); return; }
    load();
  };


  const openAssign = async () => {
    setAssignOpen(true);
    if (athletes.length === 0) {
      const { data, error } = await supabase.rpc("get_my_athletes" as any);
      if (error) {
        console.error("get_my_athletes error:", error);
        // Fallback: probaj klasično
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: ath } = await supabase
          .from("athletes")
          .select("id")
          .eq("trainer_id", user.id);
        const ids = (ath ?? []).map((a: any) => a.id);
        if (ids.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", ids);
          const pMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
          setAthletes(ids.map((id) => {
            const p = pMap.get(id) as any;
            return { id, full_name: p?.full_name ?? null, email: "" };
          }));
        }
        return;
      }
      const rows = (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
      setAthletes(rows.map((r) => ({
        id: r.id,
        full_name: r.full_name,
        email: r.email ?? "",
      })));
    }
  };

  const handleAssign = async (targetAthleteId: string) => {
    if (!parentId) return;
    setAssigning(targetAthleteId);
    try {
      await assignProgramToAthlete(parentId, targetAthleteId);
      toast.success("Program dodeljen vežbaču");
      setAssignOpen(false);
    } catch (error: any) {
      toast.error(error.message ?? "Greška pri dodeli programa");
    } finally {
      setAssigning(null);
    }
  };

  // Custom plan se kreira tiho (bez notifikacije); trener eksplicitno obavesti
  // vezbaca kad zavrsi. RPC vraca false ako je vec poslata notifikacija za ovaj plan.
  const notifyAthlete = async () => {
    if (!parentId) return;
    setNotifying(true);
    const { data, error } = await supabase.rpc("notify_athlete_about_program", {
      p_assigned_program_id: parentId,
    } as any);
    setNotifying(false);
    if (error) { toast.error(error.message); return; }
    if (data === true) toast.success("Plan poslat vežbaču");
    else toast("Plan je već poslat");
  };

  return (
    <PhoneShell
      back={mode === "assigned" && athleteId ? `/trener/vezbaci/${athleteId}` : "/trener/programi"}
      eyebrow={mode === "assigned" ? templateName : "Program"}
      title={mode === "assigned" ? "Izmeni plan" : templateName}
      rightSlot={
        <button
          onClick={() => setAddDayOpen(true)}
          className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-brand active:scale-95 transition"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
        </button>
      }
    >
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : days.length === 0 ? (
        <div className="text-center py-12">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-brand-soft flex items-center justify-center mb-3">
            <Dumbbell className="h-6 w-6 text-primary" strokeWidth={2} />
          </div>
          <h3 className="font-display text-lg font-bold mb-1">Dodaj prvi dan</h3>
          <p className="text-sm text-muted-foreground mb-4 px-8">
            Program se sastoji iz dana koji se rotiraju.
          </p>
          <Button onClick={() => setAddDayOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Novi dan
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {days.map((d) => {
            const exList = exByDay[d.id] ?? [];
            const isOpen = openDay === d.id;
            return (
              <div key={d.id} className="card-premium overflow-hidden">
                <button
                  onClick={() => setOpenDay(isOpen ? null : d.id)}
                  className="w-full flex items-center gap-3 p-4 text-left"
                >
                  <div className="h-10 w-10 rounded-lg bg-gradient-brand text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
                    {d.day_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[15px] truncate">{d.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {exList.length} {exList.length === 1 ? "vežba" : "vežbi"}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>

                {isOpen && (
                  <div className="border-t border-hairline px-4 py-3 space-y-2 bg-surface-2/50">
                    {exList.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">Nema vežbi u ovom danu</p>
                    )}
                    {exList.map((ex) => {
                      const rows = setsByEx[ex.id] ?? [];
                      const isDuration = !!ex.exercises?.is_duration_based;
                      const open = openExId === ex.id;
                      const advanced = !!advancedByEx[ex.id];
                      const name = ex.exercises?.name_en?.trim() || ex.exercises?.name || "—";
                      const thumb = ex.exercises?.thumbnail_url;
                      const mIcon = muscleIcon(ex.exercises?.primary_muscle);
                      const setCount = rows.length || ex.sets;
                      const summary = isDuration
                        ? (ex.duration_minutes != null ? `${ex.duration_minutes} min` : "Trajanje")
                        : `${setCount} ${setCount === 1 ? "serija" : "serije"}${rows[0]?.weight_kg != null ? ` · ${rows[0].weight_kg} kg` : ""}`;
                      const cols = advanced ? "28px 1fr 1fr 60px 24px" : "28px 1fr 1fr 24px";
                      return (
                        <div key={ex.id} className="bg-surface rounded-lg overflow-hidden">
                          {/* Sazeti red: thumbnail iz baze + ime + sazetak + expand; brisanje desno */}
                          <div className="flex items-center gap-2.5 p-2.5">
                            <button
                              onClick={() => setOpenExId(open ? null : ex.id)}
                              className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                            >
                              {thumb ? (
                                <img src={thumb} alt="" loading="lazy" className="h-12 w-12 rounded-lg object-cover bg-surface-2 shrink-0" />
                              ) : (
                                <div className="h-12 w-12 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
                                  <Dumbbell className="h-5 w-5 text-muted-foreground/60" />
                                </div>
                              )}
                              {mIcon && (
                                <img src={mIcon} alt="" className="h-8 w-8 rounded-full shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="font-display font-semibold text-sm truncate">{name}</div>
                                <div className="text-[12px] text-muted-foreground truncate">{summary}</div>
                              </div>
                              {open ? <ChevronUp className="h-4 w-4 text-primary shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                            </button>
                            <button
                              onClick={() => removeExercise(ex.id)}
                              aria-label="Ukloni vežbu"
                              className="h-8 w-8 rounded-md hover:bg-destructive-soft flex items-center justify-center transition shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </button>
                          </div>

                          {open && (
                            <div className="border-t border-hairline px-3 py-3">
                              {isDuration ? (
                                // Vezba na minute (trcanje/hodanje): jedno polje "Minuti".
                                <div>
                                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-semibold">Minuti</div>
                                  <Input
                                    type="number"
                                    min={1}
                                    defaultValue={ex.duration_minutes ?? ""}
                                    onBlur={(e) => {
                                      const v = e.target.value === "" ? null : parseInt(e.target.value);
                                      if (v !== ex.duration_minutes) updateExercise(ex.id, { duration_minutes: v });
                                    }}
                                    className="h-8 text-sm"
                                    placeholder="npr. 20"
                                  />
                                </div>
                              ) : (
                                // Per-set tabela (izvor istine). Pauza skrivena dok se ne ukey "napredno".
                                <div>
                                  <div className="grid items-center gap-2 mb-1.5" style={{ gridTemplateColumns: cols }}>
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold text-center">Set</span>
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold text-center">Kg</span>
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold text-center">Reps</span>
                                    {advanced && <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold text-center">Pauza (s)</span>}
                                    <span />
                                  </div>

                                  {rows.map((r, idx) => (
                                    <div key={r.id} className="grid items-center gap-2 mb-2" style={{ gridTemplateColumns: cols }}>
                                      <span className="h-6 w-6 mx-auto rounded-md bg-primary-soft text-primary text-[12px] font-bold flex items-center justify-center">
                                        {idx + 1}
                                      </span>
                                      <Input
                                        key={`w-${r.id}`}
                                        type="number"
                                        step="0.5"
                                        defaultValue={r.weight_kg ?? ""}
                                        onBlur={(e) => {
                                          const v = e.target.value === "" ? null : parseFloat(e.target.value);
                                          if (v !== r.weight_kg) applySets(ex.id, rows.map((row, i) => (i === idx ? { ...row, weight_kg: v } : row)));
                                        }}
                                        className="h-8 text-sm text-center"
                                        placeholder="—"
                                      />
                                      <Input
                                        key={`r-${r.id}`}
                                        defaultValue={r.reps}
                                        onBlur={(e) => {
                                          if (e.target.value !== r.reps) applySets(ex.id, rows.map((row, i) => (i === idx ? { ...row, reps: e.target.value } : row)));
                                        }}
                                        className="h-8 text-sm text-center"
                                        placeholder="8-12"
                                      />
                                      {advanced && (
                                        <Input
                                          key={`p-${r.id}`}
                                          type="number"
                                          defaultValue={r.rest_seconds ?? ""}
                                          onBlur={(e) => {
                                            const v = e.target.value === "" ? null : parseInt(e.target.value);
                                            if (v !== r.rest_seconds) applySets(ex.id, rows.map((row, i) => (i === idx ? { ...row, rest_seconds: v } : row)));
                                          }}
                                          className="h-8 text-sm text-center"
                                          placeholder="90"
                                        />
                                      )}
                                      <button
                                        onClick={() => { if (rows.length > 1) applySets(ex.id, rows.filter((_, i) => i !== idx)); }}
                                        disabled={rows.length <= 1}
                                        aria-label="Ukloni set"
                                        className="h-7 w-7 mx-auto rounded-md hover:bg-destructive-soft flex items-center justify-center transition disabled:opacity-30"
                                      >
                                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                                      </button>
                                    </div>
                                  ))}

                                  <div className="flex items-center justify-between mt-1">
                                    <button
                                      onClick={() => {
                                        const last = rows[rows.length - 1];
                                        applySets(ex.id, [...rows, {
                                          id: crypto.randomUUID(),
                                          set_number: rows.length + 1,
                                          reps: last?.reps ?? "10",
                                          weight_kg: last?.weight_kg ?? null,
                                          rest_seconds: last?.rest_seconds ?? 90,
                                        }]);
                                      }}
                                      className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary"
                                    >
                                      <Plus className="h-4 w-4" /> Dodaj set
                                    </button>
                                    <button
                                      onClick={() => setAdvancedByEx((p) => ({ ...p, [ex.id]: !advanced }))}
                                      className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${advanced ? "text-primary" : "text-muted-foreground"}`}
                                    >
                                      <Settings2 className="h-3.5 w-3.5" /> Pauza
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <button
                      onClick={() => openExercisePicker(d.id)}
                      className="w-full py-2.5 rounded-lg border-2 border-dashed border-hairline text-sm text-muted-foreground hover:border-primary hover:text-primary transition flex items-center justify-center gap-1.5"
                    >
                      <Plus className="h-4 w-4" /> Dodaj vežbu
                    </button>

                    <button
                      onClick={() => handleDeleteDay(d.id)}
                      className="w-full text-xs text-destructive py-2"
                    >
                      Obriši dan
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Brisanje celog sablona - samo template mod (dodeljeni plan se ne brise) */}
      {mode === "template" && (
        <button
          onClick={handleDeleteProgram}
          className="w-full text-[13px] font-semibold text-destructive py-3 mt-2 mb-24"
        >
          Obriši program
        </button>
      )}

      {/* Pomocni tekst u NORMALNOM toku (ne apsolutno preko sadrzaja), izmedju liste i
          razmaka za sticky "Posalji vezbacu" dugme - bez preklapanja sa "Dodaj vezbu". */}
      {mode === "assigned" && days.length > 0 && (
        <>
          <p className="text-[12px] text-muted-foreground text-center px-4 mt-3">
            Vežbač vidi plan tek kada ga pošaljete.
          </p>
          {/* Prostor da poslednji sadrzaj ne stoji ispod sticky "Posalji vezbacu" CTA */}
          <div className="h-24" />
        </>
      )}

      {/* Add Day - full-screen (Wolt-style) */}
      <FullScreenSheet open={addDayOpen} onClose={() => setAddDayOpen(false)} title="Novi dan">
        <form onSubmit={handleAddDay} className="flex flex-1 min-h-0 flex-col">
          <FullScreenSheetScroll className="pt-5 space-y-3">
            <div>
              <Label htmlFor="day-name">Naziv dana</Label>
              <Input
                id="day-name"
                value={newDayName}
                onChange={(e) => setNewDayName(e.target.value)}
                placeholder={`Dan ${(days[days.length - 1]?.day_number ?? 0) + 1} - Push`}
                className="mt-1.5 h-14 text-base rounded-2xl"
                autoFocus
              />
            </div>
          </FullScreenSheetScroll>
          <FullScreenSheetFooter>
            <Button type="submit" className="w-full bg-gradient-brand text-white shadow-brand">Dodaj dan</Button>
          </FullScreenSheetFooter>
        </form>
      </FullScreenSheet>

      {/* Exercise Picker */}
      <ExercisePickerSheet
        open={!!pickerDayId}
        dayId={pickerDayId}
        dayName={days.find((d) => d.id === pickerDayId)?.name ?? ""}
        table={cfg.exTable}
        onClose={() => setPickerDayId(null)}
        onAdded={() => { setPickerDayId(null); load(); }}
      />

      {/* Assign Dialog - samo u template modu (dodeljeni plan je vec dodeljen) */}
      {mode === "template" && (
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader><DialogTitle>Dodeli vežbaču</DialogTitle></DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-1 -mx-1 px-1">
            {athletes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nemaš još vežbača. Pošalji invite link.
              </p>
            ) : (
              athletes.map((a) => (
                <button
                  key={a.id}
                  onClick={() => handleAssign(a.id)}
                  disabled={assigning === a.id}
                  className="w-full text-left p-3 rounded-lg hover:bg-surface-2 flex items-center gap-3 transition disabled:opacity-50"
                >
                  <div className="h-10 w-10 rounded-full bg-gradient-athlete text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
                    {(a.full_name ?? a.email).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{a.full_name ?? "Bez imena"}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{a.email}</div>
                  </div>
                  {assigning === a.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Check className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* Sticky bottom CTA - dodela samo u template modu */}
      {mode === "template" && days.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 px-6 pb-6 pt-3 bg-gradient-to-t from-background via-background to-transparent pointer-events-none">
          <div className="max-w-[440px] mx-auto pointer-events-auto">
            <Button onClick={openAssign} className="w-full h-12 shadow-brand">
              <UserPlus className="h-4 w-4 mr-2" />
              Dodeli vežbaču
            </Button>
          </div>
        </div>
      )}

      {/* Sticky bottom CTA - posalji vezbacu samo u assigned modu */}
      {mode === "assigned" && days.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 px-6 pb-6 pt-3 bg-gradient-to-t from-background via-background to-transparent pointer-events-none">
          <div className="max-w-[440px] mx-auto pointer-events-auto">
            <Button
              onClick={notifyAthlete}
              disabled={notifying}
              className="w-full h-12 bg-gradient-brand text-white shadow-brand"
            >
              {notifying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Pošalji vežbaču
            </Button>
          </div>
        </div>
      )}
    </PhoneShell>
  );
};

export default ProgramBuilder;
