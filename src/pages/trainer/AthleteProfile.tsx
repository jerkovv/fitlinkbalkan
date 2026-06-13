import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useConfirm } from "@/hooks/useConfirm";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { PhoneShell } from "@/components/PhoneShell";
import { SendMessageToAthlete } from "@/components/SendMessageToAthlete";
import { Avatar, Card, Chip } from "@/components/ui-bits";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  FullScreenSheet,
  FullScreenSheetScroll,
  FullScreenSheetFooter,
} from "@/components/ui/full-screen-sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Apple, ClipboardList, Wallet, MessageSquare, Phone, Loader2, Plus, X, Check,
  Dumbbell, Scale, UserMinus, Flame, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { InAppWorkoutsList } from "@/components/InAppWorkoutsList";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { assignProgramToAthlete } from "@/lib/programAssignment";
import { ProgressPhotos } from "@/components/ProgressPhotos";
import { HealthMetricsCard } from "@/components/wearables/HealthMetricsCard";
import { WearableTrendChart } from "@/components/wearables/WearableTrendChart";
import { useWearableConnections } from "@/hooks/useWearableConnections";
import { WorkoutsList } from "@/components/wearables/WorkoutsList";

type AthleteData = {
  id: string;
  goal: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  joined_at: string;
  full_name: string | null;
  phone: string | null;
};

type NutritionTemplate = {
  id: string;
  name: string;
  goal: string | null;
  target_kcal: number | null;
};

type AssignedPlan = {
  id: string;
  name: string;
  target_kcal: number | null;
  assigned_at: string;
  is_active: boolean;
};

type AssignedProgram = {
  id: string;
  name: string;
  assigned_at: string;
  total_days: number;
};

type ProgramTemplate = {
  id: string;
  name: string;
  goal: string | null;
};

type BodyMetric = {
  id: string;
  recorded_on: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
};

const goalLabel: Record<string, string> = {
  lose_weight: "Mršavljenje",
  gain_muscle: "Masa",
  endurance: "Izdržljivost",
  mobility: "Mobilnost",
  general: "Opšte",
};

const initialsOf = (name: string | null) => {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "??";
};

// Boja po riziku (iz get_athlete_stats): low zeleno, medium amber, high crveno.
const RISK_TEXT: Record<string, string> = {
  low: "text-success-soft-foreground",
  medium: "text-warning-soft-foreground",
  high: "text-destructive",
};

const fmtVolume = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(Math.round(n)));

// Premium stat kartica (isti jezik kao Finances StatTile).
const StatBox = ({
  label,
  value,
  unit,
  sub,
  valueClass,
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  valueClass?: string;
  icon?: ReactNode;
}) => (
  <Card className="p-4">
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
        {label}
      </div>
      {icon && <span className="text-primary shrink-0">{icon}</span>}
    </div>
    <div className="flex items-baseline gap-1">
      <span className={cn("font-display font-bold tracking-tightest leading-none text-[22px]", valueClass ?? "text-foreground")}>
        {value}
      </span>
      {unit && <span className="text-[11px] font-medium text-muted-foreground">{unit}</span>}
    </div>
    {sub && <div className="text-[11px] text-muted-foreground mt-1.5 truncate">{sub}</div>}
  </Card>
);

const AthleteProfile = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const confirmRemoveAthlete = async () => {
    if (!id) return;
    setRemoving(true);
    try {
      const { error } = await supabase
        .from("athletes")
        .update({ trainer_id: null })
        .eq("id", id);
      if (error) throw error;
      toast.success("Vežbač uklonjen");
      setRemoveOpen(false);
      navigate("/trener/vezbaci");
    } catch (e: any) {
      toast.error(e.message ?? "Greška pri uklanjanju");
    } finally {
      setRemoving(false);
    }
  };
  const { connections: wearableConns } = useWearableConnections(id);
  const lastWearableSync = wearableConns
    .map((c) => c.last_sync_at)
    .filter(Boolean)
    .sort()
    .pop() as string | undefined;
  const hasWearable = wearableConns.some((c) => c.status === "connected");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any | null>(null);
  const [athlete, setAthlete] = useState<AthleteData | null>(null);
  const [activePlan, setActivePlan] = useState<AssignedPlan | null>(null);
  const [activeProgram, setActiveProgram] = useState<AssignedProgram | null>(null);
  const [latestMetric, setLatestMetric] = useState<BodyMetric | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<BodyMetric[]>([]);
  const [activeMembership, setActiveMembership] = useState<{
    id: string;
    plan_name: string;
    ends_on: string | null;
    sessions_total: number | null;
    sessions_used: number;
  } | null>(null);
  const [bonusOpen, setBonusOpen] = useState(false);
  const [bonusCount, setBonusCount] = useState("1");
  const [bonusSaving, setBonusSaving] = useState(false);

  // Nutrition assign dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [templates, setTemplates] = useState<NutritionTemplate[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);

  // Program assign dialog
  const [progOpen, setProgOpen] = useState(false);
  const [progTemplates, setProgTemplates] = useState<ProgramTemplate[]>([]);
  const [progAssigning, setProgAssigning] = useState<string | null>(null);

  // Custom plan od nule (kreira prazan assigned_programs, otvara editor)
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customCreating, setCustomCreating] = useState(false);

  // Workout session detail

  const load = async () => {
    if (!id) return;
    setLoading(true);

    const [aRes, pRes, planRes, progRes, metricsRes] = await Promise.all([
      supabase.from("athletes").select("*").eq("id", id).maybeSingle(),
      supabase.from("profiles").select("full_name, phone").eq("id", id).maybeSingle(),
      supabase
        .from("assigned_nutrition_plans")
        .select("id, name, target_kcal, assigned_at, is_active")
        .eq("athlete_id", id)
        .eq("is_active", true)
        .order("assigned_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("assigned_programs")
        .select("id, name, assigned_at")
        .eq("athlete_id", id)
        .order("assigned_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("body_metrics")
        .select("id, recorded_on, weight_kg, body_fat_pct")
        .eq("athlete_id", id)
        .order("recorded_on", { ascending: false })
        .limit(10),
    ]);

    if (aRes.data) {
      setAthlete({
        ...(aRes.data as any),
        full_name: (pRes.data as any)?.full_name ?? null,
        phone: (pRes.data as any)?.phone ?? null,
      });
    }
    setActivePlan((planRes.data as any) ?? null);

    // Active program + total days count
    if (progRes.data) {
      const prog: any = progRes.data;
      const { count } = await supabase
        .from("assigned_program_days")
        .select("id", { count: "exact", head: true })
        .eq("assigned_program_id", prog.id)
        .is("deleted_at", null);
      setActiveProgram({ id: prog.id, name: prog.name, assigned_at: prog.assigned_at, total_days: count ?? 0 });
    } else {
      setActiveProgram(null);
    }

    const metrics = (metricsRes.data as any[]) ?? [];
    setMetricsHistory(metrics);
    setLatestMetric(metrics[0] ?? null);

    // Active membership
    const { data: memData } = await supabase
      .from("memberships")
      .select("id, plan_name, ends_on, sessions_total, sessions_used")
      .eq("athlete_id", id)
      .eq("status", "active")
      .order("ends_on", { ascending: false })
      .limit(1)
      .maybeSingle();
    setActiveMembership((memData as any) ?? null);

    setLoading(false);
  };

  const addBonus = async () => {
    if (!activeMembership) return;
    const n = parseInt(bonusCount, 10);
    if (!n || n < 1) return toast.error("Unesi broj treninga");
    setBonusSaving(true);
    const { error } = await supabase.rpc("add_bonus_sessions", {
      p_membership_id: activeMembership.id,
      p_count: n,
    });
    setBonusSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Dodato ${n} treninga`);
    setBonusOpen(false);
    setBonusCount("1");
    load();
  };

  useEffect(() => { load(); }, [id]);

  // Statisticki blok (backend racuna sve; mi samo prikazujemo).
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.rpc("get_athlete_stats", { p_athlete_id: id } as any);
      setStats(data ?? null);
    })();
  }, [id]);

  const openProgramAssign = async () => {
    setProgOpen(true);
    if (progTemplates.length === 0 && user) {
      const { data } = await supabase
        .from("program_templates")
        .select("id, name, goal")
        .eq("trainer_id", user.id)
        .order("created_at", { ascending: false });
      setProgTemplates((data as any) ?? []);
    }
  };

  const copyProgramContent = async (templateId: string, assignedProgramId: string): Promise<boolean> => {
    const { count, error: existingErr } = await supabase
      .from("assigned_program_days")
      .select("id", { count: "exact", head: true })
      .eq("assigned_program_id", assignedProgramId);
    if (existingErr) { toast.error(existingErr.message); return false; }
    if ((count ?? 0) > 0) return true;

    const { data: tDays } = await supabase
      .from("program_template_days")
      .select("id, day_number, name")
      .eq("template_id", templateId)
      .order("day_number");
    const days: any[] = (tDays as any[]) ?? [];
    if (days.length === 0) { toast.error("Program nema nijedan dan. Dodaj bar jedan dan."); return false; }

    const { data: tExs } = await supabase
      .from("program_template_exercises")
      .select("day_id, exercise_id, position, sets, reps, weight_kg, rest_seconds")
      .in("day_id", days.map((d) => d.id))
      .order("position");

    const { data: newDays, error: dErr } = await supabase
      .from("assigned_program_days")
      .insert(days.map((d) => ({ assigned_program_id: assignedProgramId, day_number: d.day_number, name: d.name })) as any)
      .select("id, day_number");
    if (dErr) { toast.error(dErr.message); return false; }

    const dayMap = new Map<string, string>();
    days.forEach((oldDay) => {
      const newDay = (newDays as any[]).find((d) => d.day_number === oldDay.day_number);
      if (newDay) dayMap.set(oldDay.id, newDay.id);
    });

    const exInserts = ((tExs as any[]) ?? [])
      .map((e) => ({ day_id: dayMap.get(e.day_id), exercise_id: e.exercise_id, position: e.position, sets: e.sets, reps: e.reps, weight_kg: e.weight_kg, rest_seconds: e.rest_seconds }))
      .filter((e) => e.day_id);
    if (exInserts.length) {
      const { error: eErr } = await supabase.from("assigned_program_exercises").insert(exInserts as any);
      if (eErr) { toast.error(eErr.message); return false; }
    }
    return true;
  };

  const assignProgramFallback = async (templateId: string): Promise<string | null> => {
    if (!user || !id) return null;
    // 1) Učitaj template + dane + vežbe
    const [tplRes, daysRes] = await Promise.all([
      supabase.from("program_templates").select("name").eq("id", templateId).maybeSingle(),
      supabase.from("program_template_days").select("id, day_number, name").eq("template_id", templateId).order("day_number"),
    ]);
    const tpl: any = tplRes.data;
    if (!tpl) { toast.error("Program template ne postoji"); return null; }
    const tDays: any[] = (daysRes.data as any) ?? [];
    if (tDays.length === 0) { toast.error("Program nema nijedan dan. Dodaj bar jedan dan."); return null; }

    const tDayIds = tDays.map((d) => d.id);
    const { data: tExs } = await supabase
      .from("program_template_exercises")
      .select("day_id, exercise_id, position, sets, reps, weight_kg, rest_seconds")
      .in("day_id", tDayIds)
      .order("position");

    // 2) Insert assigned_programs
    const { data: ap, error: apErr } = await supabase
      .from("assigned_programs")
      .insert({ athlete_id: id, trainer_id: user.id, name: tpl.name } as any)
      .select("id")
      .single();
    if (apErr || !ap) { toast.error(apErr?.message ?? "Greška pri kreiranju programa"); return null; }
    const assignedId = (ap as any).id;

    // 3) Insert dani
    const dayInserts = tDays.map((d) => ({
      assigned_program_id: assignedId, day_number: d.day_number, name: d.name,
    }));
    const { data: newDays, error: dErr } = await supabase
      .from("assigned_program_days")
      .insert(dayInserts as any)
      .select("id, day_number");
    if (dErr) { toast.error(dErr.message); return null; }

    const dayMap = new Map<string, string>();
    tDays.forEach((od) => {
      const nd = (newDays as any[]).find((x) => x.day_number === od.day_number);
      if (nd) dayMap.set(od.id, nd.id);
    });

    // 4) Insert vežbe
    const exInserts = ((tExs as any[]) ?? [])
      .map((e) => ({
        day_id: dayMap.get(e.day_id),
        exercise_id: e.exercise_id,
        position: e.position,
        sets: e.sets,
        reps: e.reps,
        weight_kg: e.weight_kg,
        rest_seconds: e.rest_seconds,
      }))
      .filter((e) => e.day_id);
    if (exInserts.length) {
      const { error: eErr } = await supabase.from("assigned_program_exercises").insert(exInserts as any);
      if (eErr) { toast.error(eErr.message); return null; }
    }
    return assignedId;
  };

  const assignProgram = async (templateId: string) => {
    if (!user || !id) return;
    setProgAssigning(templateId);
    try {
      await assignProgramToAthlete(templateId, id);
      toast.success("Program dodeljen vežbaču");
      setProgOpen(false);
      await load();
    } catch (error: any) {
      toast.error(error.message ?? "Greška pri dodeli programa");
    } finally {
      setProgAssigning(null);
    }
  };

  // Plan od nule: RPC kreira prazan assigned_programs (source_template_id NULL),
  // postaje tekuci jer je najnoviji assigned_at, pa otvaramo isti editor (mode assigned).
  const createCustomProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setCustomCreating(true);
    const { data, error } = await supabase.rpc("create_custom_assigned_program", {
      p_athlete_id: id,
      p_name: customName.trim() || "Plan treninga",
    } as any);
    setCustomCreating(false);
    if (error) { toast.error(error.message); return; }
    const assignedId = data as string;
    setCustomOpen(false);
    setCustomName("");
    navigate(`/trener/vezbaci/${id}/program/${assignedId}`);
  };

  const openAssign = async () => {
    setAssignOpen(true);
    if (templates.length === 0 && user) {
      const { data } = await supabase
        .from("nutrition_plan_templates")
        .select("id, name, goal, target_kcal")
        .eq("trainer_id", user.id)
        .order("created_at", { ascending: false });
      setTemplates((data as any) ?? []);
    }
  };

  const assignTemplate = async (templateId: string) => {
    if (!user || !id) return;
    setAssigning(templateId);
    try {
      // RPC radi ceo posao: kopira plan + dane + obroke + raspored, deaktivira
      // stari aktivni plan, salje notifikaciju (triger). Resava i ispravne kolone
      // (source_template_id), pa nema vise "template_id" greske.
      const { error } = await supabase.rpc("assign_nutrition_plan_to_athlete", {
        p_template_id: templateId,
        p_athlete_id: id,
      } as any);
      if (error) throw error;
      toast.success("Plan dodeljen vežbaču");
      setAssignOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Greška pri dodeli plana");
    } finally {
      setAssigning(null);
    }
  };

  const unassignPlan = async () => {
    if (!activePlan) return;
    if (!(await confirm({ title: "Otkazati aktivni plan ishrane?", destructive: true }))) return;
    await supabase
      .from("assigned_nutrition_plans")
      .update({ is_active: false } as any)
      .eq("id", activePlan.id);
    toast.success("Plan otkazan");
    load();
  };

  const callAthlete = () => {
    if (athlete?.phone) window.location.href = `tel:${athlete.phone}`;
    else toast.error("Vežbač nema sačuvan broj");
  };

  if (loading) {
    return (
      <PhoneShell back="/trener/vezbaci" title="Profil">
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </PhoneShell>
    );
  }

  if (!athlete) {
    return (
      <PhoneShell back="/trener/vezbaci" title="Profil">
        <div className="text-center py-10 text-sm text-muted-foreground">Vežbač ne postoji.</div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell
      back="/trener/vezbaci"
      rightSlot={<SendMessageToAthlete athleteId={athlete.id} athleteName={athlete.full_name ?? undefined} variant="icon" />}
      title={
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
            Profil vežbača
          </div>
          <h1 className="font-display text-[28px] leading-[1.1] font-bold tracking-tightest">
            {athlete.full_name ?? "Bez imena"}
          </h1>
        </div>
      }
    >
      {/* Hero */}
      <Card className="p-5 bg-gradient-brand-soft border-0">
        <div className="flex items-center gap-4">
          <Avatar initials={initialsOf(athlete.full_name)} tone="brand" size="xl" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              <Chip tone="info">{goalLabel[athlete.goal ?? "general"] ?? "Opšte"}</Chip>
              {athlete.weight_kg && <Chip tone="info">{athlete.weight_kg} kg</Chip>}
              {athlete.height_cm && <Chip tone="info">{athlete.height_cm} cm</Chip>}
            </div>
            <div className="text-[13px] text-muted-foreground">
              Pridružen {new Date(athlete.joined_at).toLocaleDateString("sr-Latn-RS")}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-5">
          <button className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-surface/80 backdrop-blur hover:bg-surface transition">
            <MessageSquare className="h-4 w-4 text-foreground" strokeWidth={2} />
            <span className="text-[11px] font-semibold">Poruka</span>
          </button>
          <button
            onClick={callAthlete}
            className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-surface/80 backdrop-blur hover:bg-surface transition"
          >
            <Phone className="h-4 w-4 text-foreground" strokeWidth={2} />
            <span className="text-[11px] font-semibold">Pozovi</span>
          </button>
          <button
            onClick={openProgramAssign}
            className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-surface/80 backdrop-blur hover:bg-surface transition"
          >
            <ClipboardList className="h-4 w-4 text-foreground" strokeWidth={2} />
            <span className="text-[11px] font-semibold">Program</span>
          </button>
        </div>
      </Card>

      {/* Statisticki blok */}
      {stats && stats.success === false ? (
        <Card className="p-6 text-center text-[13px] text-muted-foreground">
          Nema još podataka
        </Card>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatBox
              label="Ukupno treninga"
              value={String(stats.total_workouts ?? 0)}
              sub={`Ovaj mesec: ${stats.workouts_this_month ?? 0}`}
            />
            <StatBox
              label="Učestalost"
              value={String(stats.weekly_avg ?? 0)}
              unit="nedeljno"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatBox
              label="Poslednji trening"
              value={stats.days_since_last == null
                ? "Nikad"
                : stats.days_since_last <= 0
                  ? "Danas"
                  : `Pre ${stats.days_since_last} d`}
              sub={stats.days_since_last == null ? "Još nije trenirao" : undefined}
              valueClass={cn("text-[18px]", RISK_TEXT[stats.risk] ?? "text-foreground")}
            />
            <StatBox
              label="PR-ovi"
              value={String(stats.pr_count ?? 0)}
              sub={stats.best_e1rm_kg ? `${stats.best_e1rm_kg} kg najjaci` : undefined}
            />
          </div>

          {stats.sessions_total != null && stats.sessions_used != null && (
            <Card className="p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1.5">
                Iskorišćenost paketa
              </div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="font-display text-[22px] font-bold tracking-tightest leading-none tnum">
                  {stats.sessions_used}/{stats.sessions_total}
                </span>
                <span className="text-[11px] text-muted-foreground">sesija</span>
              </div>
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-brand"
                  style={{
                    width: `${Math.min(100, Math.round((stats.sessions_used / stats.sessions_total) * 100))}%`,
                  }}
                />
              </div>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3">
            <StatBox
              label="Ishrana"
              value={String(stats.nutrition_days_30 ?? 0)}
              unit="/ 30 dana"
            />
            <StatBox
              label="Volumen"
              value={fmtVolume(stats.total_volume_kg ?? 0)}
              unit="kg ukupno"
            />
          </div>

          {stats.kcal_sessions > 0 && (
            <StatBox
              icon={<Flame className="h-4 w-4" />}
              label="Kalorije"
              value={Math.round(stats.total_kcal ?? 0).toLocaleString("sr-Latn-RS")}
              unit="kcal ukupno"
              sub={stats.avg_kcal ? `Prosek po treningu: ${Math.round(stats.avg_kcal)} kcal` : undefined}
            />
          )}
        </>
      ) : null}

      {/* Training program */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Trening</div>
            <div className="font-display text-lg font-bold">Program</div>
          </div>
        </div>

        {activeProgram ? (
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-gradient-brand-soft flex items-center justify-center shrink-0">
                <Dumbbell className="h-5 w-5 text-primary" strokeWidth={2.25} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px] truncate">{activeProgram.name}</div>
                <div className="text-[12px] text-muted-foreground">
                  {activeProgram.total_days} {activeProgram.total_days === 1 ? "dan" : "dana"} · Dodeljen{" "}
                  {new Date(activeProgram.assigned_at).toLocaleDateString("sr-Latn-RS")}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <Button
                className="w-full bg-gradient-brand text-white shadow-brand"
                onClick={() => navigate(`/trener/vezbaci/${id}/program/${activeProgram.id}`)}
              >
                Izmeni plan
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="w-full" onClick={openProgramAssign}>
                  Promeni program
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setCustomOpen(true)}>
                  <Sparkles className="h-4 w-4 mr-1.5" /> Nov plan
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            <Button
              className="w-full h-12 bg-gradient-brand text-white shadow-brand"
              onClick={() => setCustomOpen(true)}
            >
              <Sparkles className="h-4 w-4 mr-1.5" /> Napravi plan od nule
            </Button>
            <button
              onClick={openProgramAssign}
              className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline hover:border-primary/40 hover:bg-primary-soft/40 py-4 text-[14px] font-semibold text-muted-foreground hover:text-primary-soft-foreground transition"
            >
              <Plus className="h-4 w-4" /> Dodeli gotov program
            </button>
          </div>
        )}
      </section>

      {/* Body metrics */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Telo</div>
            <div className="font-display text-lg font-bold">Merenja</div>
          </div>
        </div>

        {latestMetric ? (
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-info-soft flex items-center justify-center shrink-0">
                <Scale className="h-5 w-5 text-info-soft-foreground" strokeWidth={2.25} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px]">
                  {latestMetric.weight_kg ? `${latestMetric.weight_kg} kg` : "—"}
                  {latestMetric.body_fat_pct ? ` · ${latestMetric.body_fat_pct}% masti` : ""}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {new Date(latestMetric.recorded_on).toLocaleDateString("sr-Latn-RS")}
                  {metricsHistory.length > 1 && ` · ${metricsHistory.length} merenja`}
                </div>
              </div>
              {metricsHistory.length >= 2 && metricsHistory[0].weight_kg && metricsHistory[metricsHistory.length - 1].weight_kg && (
                <Chip tone={
                  (metricsHistory[0].weight_kg! - metricsHistory[metricsHistory.length - 1].weight_kg!) < 0 ? "success" : "info"
                }>
                  {(() => {
                    const diff = metricsHistory[0].weight_kg! - metricsHistory[metricsHistory.length - 1].weight_kg!;
                    return `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} kg`;
                  })()}
                </Chip>
              )}
            </div>
          </Card>
        ) : (
          <Card className="p-4 text-center text-[13px] text-muted-foreground">
            Vežbač još nije unosio merenja.
          </Card>
        )}
      </section>

      {/* Progress fotke (samo deljene) */}
      {id && <ProgressPhotos athleteId={id} canManage={false} sharedOnly />}

      {/* Wearable insights */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Wearable
            </div>
            <div className="font-display text-lg font-bold tracking-tightest">
              Zdravstveni podaci
            </div>
          </div>
          {hasWearable && lastWearableSync && (
            <div className="text-[11px] text-muted-foreground">
              {(() => {
                const diff = Date.now() - new Date(lastWearableSync).getTime();
                const m = Math.floor(diff / 60000);
                if (m < 60) return `Sinhronizovano pre ${Math.max(1, m)} min`;
                const h = Math.floor(m / 60);
                if (h < 24) return `Sinhronizovano pre ${h} h`;
                return `Sinhronizovano pre ${Math.floor(h / 24)} d`;
              })()}
            </div>
          )}
        </div>

        {hasWearable && id ? (
          <>
            <HealthMetricsCard userId={id} showConnectCta={false} />
            <WearableTrendChart userId={id} dataType="heart_rate_avg" days={30} title="Prosečan puls, poslednjih 30 dana" />
            <WearableTrendChart userId={id} dataType="workout_duration" days={30} title="Trajanje treninga, poslednjih 30 dana" />
          </>
        ) : (
          <Card className="p-4 text-center">
            <div className="text-[12px] text-muted-foreground">
              Vežbač još nije povezao uređaj
            </div>
          </Card>
        )}
      </section>

      {/* Workout history - tabovi Iz aplikacije / Sa sata */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Aktivnost</div>
            <div className="font-display text-lg font-bold">Treninzi</div>
          </div>
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
              Treninzi koje je vežbač radio kroz FitLink. Ako je nosio sat, puls i kalorije su vec ovde.
            </p>
            {id && <InAppWorkoutsList athleteId={id} limit={10} />}
          </TabsContent>
          <TabsContent value="watch">
            <p className="text-xs text-muted-foreground mt-2 mb-3">
              Aktivnosti koje je vežbač radio bez FitLink-a, direktno na satu.
            </p>
            {hasWearable && id ? (
              <WorkoutsList userId={id} limit={10} />
            ) : (
              <Card className="p-4 text-center text-[13px] text-muted-foreground">
                Vežbač nije povezao sat
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </section>

      {/* Nutrition section */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ishrana</div>
            <div className="font-display text-lg font-bold">Plan ishrane</div>
          </div>
        </div>

        {activePlan ? (
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-gradient-brand-soft flex items-center justify-center shrink-0">
                <Apple className="h-5 w-5 text-primary" strokeWidth={2.25} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px] truncate">{activePlan.name}</div>
                <div className="text-[12px] text-muted-foreground">
                  {activePlan.target_kcal ? `${activePlan.target_kcal} kcal · ` : ""}
                  Dodeljeno {new Date(activePlan.assigned_at).toLocaleDateString("sr-Latn-RS")}
                </div>
              </div>
              <button
                onClick={unassignPlan}
                className="h-9 w-9 rounded-full hover:bg-destructive-soft flex items-center justify-center"
                title="Otkaži plan"
              >
                <X className="h-4 w-4 text-destructive" />
              </button>
            </div>
            <Button
              variant="outline"
              className="w-full mt-3"
              onClick={openAssign}
            >
              Promeni plan
            </Button>
          </Card>
        ) : (
          <button
            onClick={openAssign}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline hover:border-primary/40 hover:bg-primary-soft/40 py-4 text-[14px] font-semibold text-muted-foreground hover:text-primary-soft-foreground transition"
          >
            <Plus className="h-4 w-4" /> Dodeli plan ishrane
          </button>
        )}
      </section>

      {/* Membership */}
      {activeMembership ? (
        <Card className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-11 w-11 rounded-2xl bg-success-soft text-success-soft-foreground flex items-center justify-center shrink-0">
                <Wallet className="h-[18px] w-[18px]" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold tracking-tight truncate">
                  {activeMembership.plan_name}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {activeMembership.sessions_total != null
                    ? `${activeMembership.sessions_used} / ${activeMembership.sessions_total} iskorišćeno`
                    : "Bez limita treninga"}
                  {activeMembership.ends_on && ` · do ${new Date(activeMembership.ends_on).toLocaleDateString("sr-Latn-RS", { day: "numeric", month: "short" })}`}
                </div>
              </div>
            </div>
            <Chip tone="success">Aktivna</Chip>
          </div>
          {activeMembership.sessions_total != null && (
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-brand rounded-full"
                style={{
                  width: `${Math.min(100, (activeMembership.sessions_used / activeMembership.sessions_total) * 100)}%`,
                }}
              />
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBonusOpen(true)}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Dodaj bonus treninge
          </Button>
        </Card>
      ) : (
        <Card className="p-5 text-center text-[13px] text-muted-foreground">
          Vežbač nema aktivnu članarinu. Kad izabere paket, pojaviće se u{" "}
          <Link to="/trener/uplate" className="text-primary font-semibold">
            Zahtevima za uplatu
          </Link>
          .
        </Card>
      )}

      {/* Bonus sheet */}
      <FullScreenSheet open={bonusOpen} onClose={() => setBonusOpen(false)} title="Dodaj bonus treninge">
        <FullScreenSheetScroll className="pt-5 space-y-3">
          <p className="text-[13px] text-muted-foreground">
            Dodato će se na trenutnu članarinu, bez plaćanja.
          </p>
          <input
            type="number"
            min={1}
            max={100}
            value={bonusCount}
            onChange={(e) => setBonusCount(e.target.value)}
            autoFocus
            className="w-full px-4 py-3 rounded-2xl border border-hairline bg-surface text-center font-display text-[24px] font-bold tracking-tight focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </FullScreenSheetScroll>
        <FullScreenSheetFooter>
          <Button
            onClick={addBonus}
            disabled={bonusSaving}
            className="w-full bg-gradient-brand text-white shadow-brand"
          >
            {bonusSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Dodaj
          </Button>
        </FullScreenSheetFooter>
      </FullScreenSheet>

      {/* Nov plan od nule - naziv (isti obrazac kao "+" novi sablon u Programima) */}
      <FullScreenSheet open={customOpen} onClose={() => setCustomOpen(false)} title="Nov plan treninga">
        <form onSubmit={createCustomProgram} className="flex flex-1 min-h-0 flex-col">
          <FullScreenSheetScroll className="pt-5 space-y-3">
            <p className="text-[13px] text-muted-foreground">
              Prazan plan koji praviš direktno za ovog vežbača. Posle naziva dodaješ dane i vežbe.
            </p>
            <div>
              <Label htmlFor="custom-name">Naziv plana</Label>
              <Input
                id="custom-name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="npr. Push Pull Legs"
                className="mt-1.5 h-14 text-base rounded-2xl"
                autoFocus
              />
            </div>
          </FullScreenSheetScroll>
          <FullScreenSheetFooter>
            <Button type="submit" disabled={customCreating} className="w-full bg-gradient-brand text-white shadow-brand">
              {customCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Napravi i otvori
            </Button>
          </FullScreenSheetFooter>
        </form>
      </FullScreenSheet>

      {/* Assign dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Dodeli plan ishrane</DialogTitle>
          </DialogHeader>
          {templates.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-3">Nemaš još nijedan plan.</p>
              <Link to="/trener/ishrana">
                <Button variant="outline">Napravi plan</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-y-auto flex-1 space-y-2 -mx-1 px-1">
              {templates.map((t) => {
                const isCurrent = activePlan?.name === t.name;
                const isLoading = assigning === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => assignTemplate(t.id)}
                    disabled={!!assigning}
                    className="w-full text-left p-3 rounded-xl border border-hairline hover:border-primary/40 hover:bg-primary-soft/30 flex items-center gap-3 transition disabled:opacity-50"
                  >
                    <div className="h-10 w-10 rounded-xl bg-gradient-brand-soft flex items-center justify-center shrink-0">
                      <Apple className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                        {t.name}
                        {isCurrent && <Check className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {t.target_kcal ? `${t.target_kcal} kcal` : "—"}
                        {t.goal && ` · ${t.goal}`}
                      </div>
                    </div>
                    {isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Program assign dialog */}
      <Dialog open={progOpen} onOpenChange={setProgOpen}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Dodeli program treninga</DialogTitle>
          </DialogHeader>
          {progTemplates.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-3">Nemaš još nijedan program.</p>
              <Link to="/trener/programi">
                <Button variant="outline">Napravi program</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-y-auto flex-1 space-y-2 -mx-1 px-1">
              {progTemplates.map((t) => {
                const isCurrent = activeProgram?.name === t.name;
                const isLoading = progAssigning === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => assignProgram(t.id)}
                    disabled={!!progAssigning}
                    className="w-full text-left p-3 rounded-xl border border-hairline hover:border-primary/40 hover:bg-primary-soft/30 flex items-center gap-3 transition disabled:opacity-50"
                  >
                    <div className="h-10 w-10 rounded-xl bg-gradient-brand-soft flex items-center justify-center shrink-0">
                      <Dumbbell className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                        {t.name}
                        {isCurrent && <Check className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      {t.goal && (
                        <div className="text-[11px] text-muted-foreground">
                          {goalLabel[t.goal] ?? t.goal}
                        </div>
                      )}
                    </div>
                    {isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <section className="pt-2">
        <button
          onClick={() => setRemoveOpen(true)}
          className="w-full flex items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 text-destructive py-3.5 text-[13.5px] font-semibold transition"
        >
          <UserMinus className="h-4 w-4" />
          Ukloni vežbača
        </button>
      </section>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ukloniti vežbača?</AlertDialogTitle>
            <AlertDialogDescription>
              {athlete?.full_name ?? "Vežbač"} će biti uklonjen sa tvog spiska. Njegov nalog i istorija treninga se čuvaju. Možeš ga ponovo dodati pozivnicom kasnije.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Otkaži</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmRemoveAthlete(); }}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? "Uklanjanje..." : "Ukloni vežbača"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PhoneShell>
  );
};

export default AthleteProfile;
