import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { assignProgramToAthlete } from "@/lib/programAssignment";
import { PhoneShell } from "@/components/PhoneShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, Loader2, Dumbbell, Search, Trash2, GripVertical, ChevronDown, ChevronUp, UserPlus, Check,
} from "lucide-react";
import { toast } from "sonner";

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
type LibExercise = { id: string; name: string; name_en: string | null; primary_muscle: string; equipment: string };
type Athlete = { id: string; full_name: string | null; email: string };

const ProgramBuilder = () => {
  const { id: templateId } = useParams<{ id: string }>();
  const [templateName, setTemplateName] = useState("");
  const [days, setDays] = useState<Day[]>([]);
  const [exByDay, setExByDay] = useState<Record<string, Exercise[]>>({});
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Add day dialog
  const [addDayOpen, setAddDayOpen] = useState(false);
  const [newDayName, setNewDayName] = useState("");

  // Add exercise dialog
  const [pickerDayId, setPickerDayId] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibExercise[]>([]);
  const [libQuery, setLibQuery] = useState("");

  // Assign dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);

  const load = async () => {
    if (!templateId) return;
    setLoading(true);
    const [{ data: tpl }, { data: daysData }] = await Promise.all([
      supabase.from("program_templates").select("name").eq("id", templateId).maybeSingle(),
      supabase.from("program_template_days").select("*").eq("template_id", templateId).order("day_number"),
    ]);
    setTemplateName((tpl as any)?.name ?? "Program");
    const dList = (daysData as any) ?? [];
    setDays(dList);

    if (dList.length) {
      const dayIds = dList.map((d: any) => d.id);
      const { data: exs } = await supabase
        .from("program_template_exercises")
        .select("*, exercises(name, name_en, primary_muscle)")
        .in("day_id", dayIds)
        .order("position");
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

  useEffect(() => { load(); }, [templateId]);

  const loadLibrary = async () => {
    const { data } = await supabase
      .from("exercises")
      .select("id, name, name_en, primary_muscle, equipment")
      .order("name");
    setLibrary((data as any) ?? []);
  };

  const handleAddDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateId) return;
    const nextNum = (days[days.length - 1]?.day_number ?? 0) + 1;
    const { error } = await supabase.from("program_template_days").insert({
      template_id: templateId,
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
    if (!confirm("Obrisati dan i sve njegove vežbe?")) return;
    const { error } = await supabase.from("program_template_days").delete().eq("id", dayId);
    if (error) { toast.error(error.message); return; }
    toast.success("Dan obrisan");
    load();
  };

  const openExercisePicker = async (dayId: string) => {
    setPickerDayId(dayId);
    if (library.length === 0) await loadLibrary();
  };

  const addExerciseToDay = async (exerciseId: string) => {
    if (!pickerDayId) return;
    const currentList = exByDay[pickerDayId] ?? [];
    const { error } = await supabase.from("program_template_exercises").insert({
      day_id: pickerDayId,
      exercise_id: exerciseId,
      position: currentList.length + 1,
      sets: 3,
      reps: "10",
      rest_seconds: 90,
    } as any);
    if (error) { toast.error(error.message); return; }
    setPickerDayId(null);
    setLibQuery("");
    load();
  };

  const updateExercise = async (exId: string, patch: Partial<Exercise>) => {
    const { error } = await supabase.from("program_template_exercises").update(patch as any).eq("id", exId);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const removeExercise = async (exId: string) => {
    const { error } = await supabase.from("program_template_exercises").delete().eq("id", exId);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const filteredLib = useMemo(() => {
    if (!libQuery) return library;
    const q = libQuery.toLowerCase();
    return library.filter((l) => l.name.toLowerCase().includes(q) || (l.name_en?.toLowerCase().includes(q)));
  }, [library, libQuery]);

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

  const handleAssign = async (athleteId: string) => {
    if (!templateId) return;
    setAssigning(athleteId);
    try {
      await assignProgramToAthlete(templateId, athleteId);
      toast.success("Program dodeljen vežbaču");
      setAssignOpen(false);
    } catch (error: any) {
      toast.error(error.message ?? "Greška pri dodeli programa");
    } finally {
      setAssigning(null);
    }
  };

  return (
    <PhoneShell
      back="/trener/programi"
      eyebrow="Program"
      title={templateName}
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

      {/* Add Day Dialog */}
      <Dialog open={addDayOpen} onOpenChange={setAddDayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novi dan</DialogTitle></DialogHeader>
          <form onSubmit={handleAddDay} className="space-y-3">
            <div>
              <Label htmlFor="day-name">Naziv dana</Label>
              <Input
                id="day-name"
                value={newDayName}
                onChange={(e) => setNewDayName(e.target.value)}
                placeholder={`Dan ${(days[days.length - 1]?.day_number ?? 0) + 1} — Push`}
                className="mt-1.5"
                autoFocus
              />
            </div>
            <DialogFooter><Button type="submit" className="w-full">Dodaj dan</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Exercise Picker */}
      <Dialog open={!!pickerDayId} onOpenChange={(o) => !o && setPickerDayId(null)}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader><DialogTitle>Izaberi vežbu</DialogTitle></DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={libQuery}
              onChange={(e) => setLibQuery(e.target.value)}
              placeholder="Pretraži..."
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto flex-1 space-y-1 -mx-1 px-1">
            {filteredLib.map((l) => (
              <button
                key={l.id}
                onClick={() => addExerciseToDay(l.id)}
                className="w-full text-left p-3 rounded-lg hover:bg-surface-2 flex items-center gap-3 transition"
              >
                <div className="h-9 w-9 rounded-lg bg-gradient-brand-soft flex items-center justify-center shrink-0">
                  <Dumbbell className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{l.name_en?.trim() || l.name}</div>
                  {l.name_en && l.name_en.trim() && l.name_en.trim() !== l.name && (
                    <div className="text-[11px] text-muted-foreground truncate">{l.name}</div>
                  )}
                  <div className="text-[11px] text-muted-foreground capitalize">{l.primary_muscle.replace("_", " ")}</div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
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

      {/* Sticky bottom CTA */}
      {days.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 px-6 pb-6 pt-3 bg-gradient-to-t from-background via-background to-transparent pointer-events-none">
          <div className="max-w-[440px] mx-auto pointer-events-auto">
            <Button onClick={openAssign} className="w-full h-12 shadow-brand">
              <UserPlus className="h-4 w-4 mr-2" />
              Dodeli vežbaču
            </Button>
          </div>
        </div>
      )}
    </PhoneShell>
  );
};

export default ProgramBuilder;
