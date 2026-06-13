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
  Plus, Loader2, Dumbbell, Trash2, GripVertical, ChevronDown, ChevronUp, UserPlus, Check, Send,
} from "lucide-react";
import { toast } from "sonner";
import { ExercisePickerSheet } from "@/components/exercises/ExercisePickerSheet";

type Day = { id: string; day_number: number; name: string; notes: string | null };
type Exercise = {
  id: string;
  exercise_id: string;
  position: number;
  sets: number;
  reps: string;
  weight_kg: number | null;
  rest_seconds: number | null;
  notes: string | null;
  exercises: { name: string; name_en: string | null; primary_muscle: string } | null;
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
        softDelete: true,
      } as const
    : {
        parentTable: "program_templates",
        daysTable: "program_template_days",
        exTable: "program_template_exercises",
        parentCol: "template_id",
        softDelete: false,
      } as const;
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [templateName, setTemplateName] = useState("");
  const [days, setDays] = useState<Day[]>([]);
  const [exByDay, setExByDay] = useState<Record<string, Exercise[]>>({});
  const [openDay, setOpenDay] = useState<string | null>(null);
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
        .select("*, exercises(name, name_en, primary_muscle)")
        .in("day_id", dayIds);
      if (cfg.softDelete) exQ = exQ.is("deleted_at", null);
      const { data: exs } = await exQ.order("position");
      const grouped: Record<string, Exercise[]> = {};
      (exs as any ?? []).forEach((e: Exercise) => {
        const k = (e as any).day_id;
        grouped[k] = grouped[k] ?? [];
        grouped[k].push(e);
      });
      setExByDay(grouped);
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
                    {exList.map((ex) => (
                      <div key={ex.id} className="bg-surface rounded-lg p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm truncate">{ex.exercises?.name_en?.trim() || ex.exercises?.name || "—"}</div>
                            {ex.exercises?.name_en && ex.exercises.name_en.trim() && ex.exercises.name_en.trim() !== ex.exercises.name && (
                              <div className="text-[11px] text-muted-foreground truncate">{ex.exercises.name}</div>
                            )}
                            <div className="text-[11px] text-muted-foreground capitalize">{ex.exercises?.primary_muscle?.replace("_", " ")}</div>
                          </div>
                          <button
                            onClick={() => removeExercise(ex.id)}
                            className="h-7 w-7 rounded-md hover:bg-destructive-soft flex items-center justify-center transition"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-semibold">Setovi</div>
                            <Input
                              type="number"
                              min={1}
                              defaultValue={ex.sets}
                              onBlur={(e) => {
                                const v = parseInt(e.target.value);
                                if (v && v !== ex.sets) updateExercise(ex.id, { sets: v });
                              }}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-semibold">Ponavljanja</div>
                            <Input
                              defaultValue={ex.reps}
                              onBlur={(e) => {
                                if (e.target.value !== ex.reps) updateExercise(ex.id, { reps: e.target.value });
                              }}
                              className="h-8 text-sm"
                              placeholder="8-12"
                            />
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-semibold">Težina (kg)</div>
                            <Input
                              type="number"
                              step="0.5"
                              defaultValue={ex.weight_kg ?? ""}
                              onBlur={(e) => {
                                const v = e.target.value === "" ? null : parseFloat(e.target.value);
                                if (v !== ex.weight_kg) updateExercise(ex.id, { weight_kg: v });
                              }}
                              className="h-8 text-sm"
                              placeholder="—"
                            />
                          </div>
                        </div>
                      </div>
                    ))}

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

      {/* Prostor da poslednji dan ne stoji ispod sticky "Obavesti vezbaca" CTA */}
      {mode === "assigned" && days.length > 0 && <div className="h-24" />}

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
            <p className="text-[11px] text-muted-foreground text-center mb-2">
              Vežbač vidi plan tek kada ga pošaljete. Kada završite, pošaljite ga.
            </p>
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
