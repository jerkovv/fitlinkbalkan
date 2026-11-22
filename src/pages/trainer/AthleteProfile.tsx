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
  Apple, ClipboardList, Wallet, Phone, Loader2, Plus, X, Check,
  Dumbbell, Scale, UserMinus, Flame, Sparkles, Mail, Copy, Pencil,
  ChevronLeft, Clock, Trophy, BarChart3, Calendar, Heart, MessageSquare, StickyNote, Trash2,
} from "lucide-react";
import { porukaGreske } from "@/lib/errorMessage";
import { toast } from "sonner";
import { InAppWorkoutsList } from "@/components/InAppWorkoutsList";
import { UpisTreninga } from "@/components/trainer/UpisTreninga";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { assignProgramToAthlete } from "@/lib/programAssignment";
import { ProgressPhotos } from "@/components/ProgressPhotos";
import { HealthMetricsCard } from "@/components/wearables/HealthMetricsCard";
import { WearableTrendChart } from "@/components/wearables/WearableTrendChart";
import { useWearableConnections } from "@/hooks/useWearableConnections";
import { WorkoutsList } from "@/components/wearables/WorkoutsList";
import { MembershipEditSheet } from "@/components/trainer/MembershipEditSheet";
import { AktivanTreningBaner, useAktivnaSesija, ZaustaviTreningDugme, ZABORAVLJEN_POSLE_MS } from "@/components/trainer/ZaustaviTrening";
import { formatDuration } from "@/lib/workout/hrZone";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { OBLASTI } from "@/components/pretplata/oblastiZakljucanja";
import { LockMark } from "@/components/pretplata/LockMark";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { UrediVezbacaSheet } from "@/components/trainer/web/vezbaci/UrediVezbacaSheet";
import { MerenjaVezbaca } from "@/components/trainer/web/vezbaci/MerenjaVezbaca";
import { ZdravljeVezbaca } from "@/components/trainer/web/vezbaci/ZdravljeVezbaca";
import { FotografijeVezbaca } from "@/components/trainer/web/vezbaci/FotografijeVezbaca";
import { PodeliMesec, TreninziNapredak, useVolumeniTreninga } from "@/components/trainer/web/vezbaci/TreninziNapredak";
import { NacrtPlana } from "@/components/trainer/web/vezbaci/NacrtPlana";
import { ClanarinaVezbaca, type ClanarinaRed } from "@/components/trainer/web/vezbaci/ClanarinaVezbaca";
import { ID_DELOVA, NapredakPrecice } from "@/components/trainer/web/vezbaci/NapredakPrecice";
import { usePulsUzivo } from "@/components/trainer/web/vezbaci/usePulsUzivo";
import { ciljNaziv } from "@/components/trainer/web/vezbaci/aktivnost";

type AthleteData = {
  id: string;
  goal: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  joined_at: string;
  full_name: string | null;
  phone: string | null;
  avatar_url?: string | null;
  notes?: string | null;
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
  published_at: string | null;
};

type AssignedProgram = {
  id: string;
  name: string;
  assigned_at: string;
  total_days: number;
  published_at: string | null;
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

// Status polje - njime trener rucno upravlja, ne racuna se iz datuma.
const STATUS_LABEL: Record<string, string> = {
  active: "Aktivna",
  paused: "Pauzirana",
  expired: "Istekla",
  cancelled: "Otkazana",
};
const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "muted"> = {
  active: "success",
  paused: "warning",
  expired: "danger",
  cancelled: "muted",
};

// Bez roka na isteku (ends_on null) -> "Bez roka". Nista u bazi automatski ne
// prebacuje clanarinu u expired, zato se ovaj badz racuna IZ ends_on, ne iz status kolone.
const daysLeftBadge = (daysLeft: number | null): { label: string; tone: "success" | "warning" | "danger" | "muted" } => {
  if (daysLeft == null) return { label: "Bez roka", tone: "muted" };
  if (daysLeft < 0) return { label: "Istekla", tone: "danger" };
  if (daysLeft <= 7) return { label: "Ističe uskoro", tone: "warning" };
  return { label: "Aktivna", tone: "success" };
};

const fmtShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("sr-Latn-RS", { day: "numeric", month: "short" });

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

// Racunar: naslov sekcije (eyebrow + naslov levo, opciona akcija desno).
const SectionHead = ({
  eyebrow,
  title,
  right,
}: {
  eyebrow: string;
  title: string;
  right?: ReactNode;
}) => (
  <div className="flex items-end justify-between gap-3">
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {eyebrow}
      </div>
      <h2 className="font-display text-[19px] font-bold tracking-tight">{title}</h2>
    </div>
    {right}
  </div>
);

// Racunar: oznake u karticama, isti izgled kao u mrezi programa.
const META_CHIP =
  "inline-flex items-center rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground";
const META_CHIP_PRIMARY =
  "inline-flex items-center rounded-full bg-primary-soft px-2.5 py-1 text-[11.5px] font-semibold text-primary";

const AthleteProfile = () => {
  const { locked, openLock, guard } = usePretplataLock();
  const desktop = useDesktopWeb();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [upisujem, setUpisujem] = useState(false);
  // Menja se posle upisa, da se spisak treninga ponovo ucita.
  const [upisKey, setUpisKey] = useState(0);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Racunar: izmena podataka, nova clanarina pored postojece i duzina istorije treninga.
  const [urediOpen, setUrediOpen] = useState(false);
  const [novaClanarina, setNovaClanarina] = useState(false);
  const [clanarinaPoznata, setClanarinaPoznata] = useState(false);
  const [nacrtKljuc, setNacrtKljuc] = useState(0);
  const [treningaLimit, setTreningaLimit] = useState(10);
  const volumeni = useVolumeniTreninga(desktop ? id : undefined, upisKey);

  const confirmRemoveAthlete = async () => {
    if (locked) return openLock();
    if (!id) return;
    setRemoving(true);
    try {
      const { data, error } = await supabase.rpc("trainer_unassign_athlete", {
        p_athlete_id: id,
      });
      if (error) throw error;
      if (!data?.success) {
        const reason = data?.error;
        throw new Error(
          reason === "not_found"
            ? "Vežbač nije pronađen."
            : reason === "not_your_athlete"
            ? "Nemaš dozvolu za ovu radnju."
            : "Nešto nije u redu. Pokušaj ponovo."
        );
      }
      toast.success("Vežbač uklonjen");
      setRemoveOpen(false);
      navigate("/trener/vezbaci");
    } catch (e: any) {
      toast.error(porukaGreske(e));
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
  // Email klijenta: RPC vraca email SAMO njegovom treneru (trainer_id = auth.uid()), inace null.
  const [athleteEmail, setAthleteEmail] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<AssignedPlan | null>(null);
  const [activeProgram, setActiveProgram] = useState<AssignedProgram | null>(null);
  const [latestMetric, setLatestMetric] = useState<BodyMetric | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<BodyMetric[]>([]);
  const [activeMembership, setActiveMembership] = useState<ClanarinaRed | null>(null);
  const [bonusOpen, setBonusOpen] = useState(false);
  const [bonusCount, setBonusCount] = useState("1");
  const [bonusSaving, setBonusSaving] = useState(false);
  const [membershipEditOpen, setMembershipEditOpen] = useState(false);

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

  // Custom plan ishrane od nule (kreira prazan assigned_nutrition_plans, otvara editor)
  const [customNutOpen, setCustomNutOpen] = useState(false);
  const [customNutName, setCustomNutName] = useState("");
  const [customNutCreating, setCustomNutCreating] = useState(false);

  // Zapocet (nesacuvan/neposlat) draft: nudi Nastavi / Napravi nov
  const [draftResume, setDraftResume] = useState<
    { kind: "program" | "nutrition"; draftId: string; draftName: string } | null
  >(null);

  // Workout session detail

  const load = async (tiho = false) => {
    if (!id) return;
    if (!tiho) setLoading(true);

    // Email (RPC, paralelno; vraca null ako nije ovog trenera klijent) - ne blokira ostatak.
    supabase
      .rpc("get_athlete_email" as any, { p_athlete_id: id })
      .then(
        ({ data }: any) => setAthleteEmail((data as string | null) ?? null),
        () => setAthleteEmail(null),
      );

    const [aRes, pRes, planRes, progRes, metricsRes] = await Promise.all([
      supabase.from("athletes").select("*").eq("id", id).maybeSingle(),
      supabase.from("profiles").select("full_name, phone, avatar_url").eq("id", id).maybeSingle(),
      // Kartica prikazuje SAMO poslat plan (published_at NOT NULL). Nacrt se ne vidi.
      supabase
        .from("assigned_nutrition_plans")
        .select("id, name, target_kcal, assigned_at, is_active, published_at")
        .eq("athlete_id", id)
        .eq("is_active", true)
        .not("published_at", "is", null)
        .order("assigned_at", { ascending: false })
        .limit(1),
      supabase
        .from("assigned_programs")
        .select("id, name, assigned_at, published_at")
        .eq("athlete_id", id)
        .not("published_at", "is", null)
        .order("assigned_at", { ascending: false })
        .limit(1),
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
        avatar_url: (pRes.data as any)?.avatar_url ?? null,
      });
    }
    setActivePlan((planRes.data as any[])?.[0] ?? null);

    // Active program + total days count
    const prog: any = (progRes.data as any[])?.[0];
    if (prog) {
      const { count } = await supabase
        .from("assigned_program_days")
        .select("id", { count: "exact", head: true })
        .eq("assigned_program_id", prog.id)
        .is("deleted_at", null);
      setActiveProgram({ id: prog.id, name: prog.name, assigned_at: prog.assigned_at, total_days: count ?? 0, published_at: prog.published_at ?? null });
    } else {
      setActiveProgram(null);
    }

    const metrics = (metricsRes.data as any[]) ?? [];
    setMetricsHistory(metrics);
    setLatestMetric(metrics[0] ?? null);

    // Clanarina - uzimamo SVE redove (ne samo status='active') da trener vidi
    // i istekle/otkazane umesto prazne kartice. Sortiranje aktivna prvo, pa
    // ends_on opadajuce (nema ga u supabase-js .order() kao izraz, radimo u JS-u).
    let clanarineUpit = supabase
      .from("memberships")
      .select("id, plan_name, price, status, starts_on, ends_on, sessions_total, sessions_used, purchase_id, membership_purchases(paid_at)")
      .eq("athlete_id", id);
    // Racunar: samo clanarine kod ovog trenera, isto kao na telefonu.
    if (desktop && user) clanarineUpit = clanarineUpit.eq("trainer_id", user.id);
    const { data: memRows, error: memErr } = await clanarineUpit;
    const sortedMem = ((memRows as any[]) ?? []).slice().sort((a, b) => {
      const aActive = a.status === "active" ? 0 : 1;
      const bActive = b.status === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      const aEnds = a.ends_on ?? "";
      const bEnds = b.ends_on ?? "";
      if (!aEnds && !bEnds) return 0;
      if (!aEnds) return 1;
      if (!bEnds) return -1;
      return aEnds < bEnds ? 1 : aEnds > bEnds ? -1 : 0;
    });
    // Neuspeo upit ne sme da izgleda kao "nema clanarinu".
    if (memErr) {
      toast.error(porukaGreske(memErr));
    } else {
      setActiveMembership(sortedMem[0] ?? null);
      setClanarinaPoznata(true);
    }

    setLoading(false);
  };

  const addBonus = async () => {
    if (locked) return openLock(OBLASTI.naplata);
    if (!activeMembership) return;
    const n = parseInt(bonusCount, 10);
    if (!n || n < 1) return toast.error("Unesi broj treninga");
    setBonusSaving(true);
    const { error } = await supabase.rpc("add_bonus_sessions", {
      p_membership_id: activeMembership.id,
      p_count: n,
    });
    setBonusSaving(false);
    if (error) return toast.error(porukaGreske(error));
    toast.success(`Dodato ${n} treninga`);
    setBonusOpen(false);
    setBonusCount("1");
    load(desktop);
  };

  useEffect(() => { load(); }, [id]);

  // Statisticki blok (backend racuna sve; mi samo prikazujemo).
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.rpc("get_athlete_stats", { p_athlete_id: id } as any);
      setStats(data ?? null);
    })();
    // upisKey: posle "Upisi trening" brojke na vrhu se osvezavaju zajedno sa spiskom.
  }, [id, upisKey]);

  const openProgramAssign = async () => {
    if (locked) return openLock(OBLASTI.programi);
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
    if (existingErr) { toast.error(porukaGreske(existingErr)); return false; }
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
    if (dErr) { toast.error(porukaGreske(dErr)); return false; }

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
      if (eErr) { toast.error(porukaGreske(eErr)); return false; }
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
    if (apErr || !ap) { toast.error(porukaGreske(apErr)); return null; }
    const assignedId = (ap as any).id;

    // 3) Insert dani
    const dayInserts = tDays.map((d) => ({
      assigned_program_id: assignedId, day_number: d.day_number, name: d.name,
    }));
    const { data: newDays, error: dErr } = await supabase
      .from("assigned_program_days")
      .insert(dayInserts as any)
      .select("id, day_number");
    if (dErr) { toast.error(porukaGreske(dErr)); return null; }

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
      if (eErr) { toast.error(porukaGreske(eErr)); return null; }
    }
    return assignedId;
  };

  const assignProgram = async (templateId: string) => {
    if (locked) return openLock(OBLASTI.programi);
    if (!user || !id) return;
    setProgAssigning(templateId);
    try {
      await assignProgramToAthlete(templateId, id);
      toast.success("Program dodeljen vežbaču");
      setProgOpen(false);
      await load(desktop);
    } catch (error: any) {
      toast.error(porukaGreske(error));
    } finally {
      setProgAssigning(null);
    }
  };

  // Plan od nule: RPC kreira prazan assigned_programs (source_template_id NULL),
  // postaje tekuci jer je najnoviji assigned_at, pa otvaramo isti editor (mode assigned).
  const createCustomProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return openLock(OBLASTI.programi);
    if (!id) return;
    setCustomCreating(true);
    const { data, error } = await supabase.rpc("create_custom_assigned_program", {
      p_athlete_id: id,
      p_name: customName.trim() || "Plan treninga",
    } as any);
    setCustomCreating(false);
    if (error) { toast.error(porukaGreske(error)); return; }
    const assignedId = data as string;
    setCustomOpen(false);
    setCustomName("");
    navigate(`/trener/vezbaci/${id}/program/${assignedId}`);
  };

  // Plan ishrane od nule: RPC kreira prazan assigned_nutrition_plans (tiho, bez
  // notifikacije), trener gradi pa eksplicitno "Obavesti vezbaca" iz editora.
  const createCustomNutrition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return openLock(OBLASTI.ishrana);
    if (!id) return;
    setCustomNutCreating(true);
    const { data, error } = await supabase.rpc("create_custom_assigned_nutrition_plan", {
      p_athlete_id: id,
      p_name: customNutName.trim() || "Plan ishrane",
    } as any);
    setCustomNutCreating(false);
    if (error) { toast.error(porukaGreske(error)); return; }
    const assignedId = data as string;
    setCustomNutOpen(false);
    setCustomNutName("");
    navigate(`/trener/vezbaci/${id}/ishrana/${assignedId}`);
  };

  // "Nov plan" klik: ako postoji zapocet draft (custom, jos neposlat) ponudi
  // Nastavi/Napravi nov; inace odmah otvori naziv dijalog za nov plan.
  const startCustomProgram = async () => {
    if (locked) return openLock(OBLASTI.programi);
    if (!id) return;
    // limit(1) + niz (BEZ maybeSingle): vise drafta -> uzmi najnoviji jedan.
    // Hvatamo error da ne padne tiho u "nema drafta" pa da gomila nove.
    const { data, error } = await supabase
      .from("assigned_programs")
      .select("id, name")
      .eq("athlete_id", id)
      .is("source_template_id", null)
      .is("published_at", null)
      .order("assigned_at", { ascending: false })
      .limit(1);
    if (error) { toast.error(porukaGreske(error)); return; }
    const draft = (data as any[] | null)?.[0];
    if (draft) setDraftResume({ kind: "program", draftId: draft.id, draftName: draft.name });
    else setCustomOpen(true);
  };

  const startCustomNutrition = async () => {
    if (locked) return openLock(OBLASTI.ishrana);
    if (!id) return;
    const { data, error } = await supabase
      .from("assigned_nutrition_plans")
      .select("id, name")
      .eq("athlete_id", id)
      .is("source_template_id", null)
      .is("published_at", null)
      .order("assigned_at", { ascending: false })
      .limit(1);
    if (error) { toast.error(porukaGreske(error)); return; }
    const draft = (data as any[] | null)?.[0];
    if (draft) setDraftResume({ kind: "nutrition", draftId: draft.id, draftName: draft.name });
    else setCustomNutOpen(true);
  };

  const continueDraft = () => {
    if (!draftResume || !id) return;
    const path = draftResume.kind === "program" ? "program" : "ishrana";
    const draftId = draftResume.draftId;
    setDraftResume(null);
    navigate(`/trener/vezbaci/${id}/${path}/${draftId}`);
  };

  const makeNewFromDraft = async () => {
    if (locked) return openLock(draftResume?.kind === "nutrition" ? OBLASTI.ishrana : OBLASTI.programi);
    if (!draftResume) return;
    const { kind, draftId } = draftResume;
    // Draft nije poslat -> nema istorije, pravi DELETE je bezbedan (CASCADE brise dane/obroke).
    const table = kind === "program" ? "assigned_programs" : "assigned_nutrition_plans";
    const { error } = await supabase.from(table).delete().eq("id", draftId);
    if (error) { toast.error(porukaGreske(error)); return; }
    setNacrtKljuc((n) => n + 1);
    setDraftResume(null);
    if (kind === "program") setCustomOpen(true);
    else setCustomNutOpen(true);
  };

  const openAssign = async () => {
    if (locked) return openLock(OBLASTI.ishrana);
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
    if (locked) return openLock(OBLASTI.ishrana);
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
      load(desktop);
    } catch (e: any) {
      toast.error(porukaGreske(e));
    } finally {
      setAssigning(null);
    }
  };

  const unassignPlan = async () => {
    if (locked) return openLock(OBLASTI.ishrana);
    if (!activePlan || !id) return;
    if (!(await confirm(desktop
      ? {
          title: "Ukloniti plan ishrane?",
          description: `${athlete?.full_name ?? "Vežbač"} više neće videti plan ishrane.`,
          confirmLabel: "Ukloni plan",
          destructive: true,
        }
      : { title: "Otkazati aktivni plan ishrane?", destructive: true }))) return;
    // Obrisi SVE planove ishrane ovog vezbaca odjednom (jedan klik = prazno).
    // Ishrana nema istoriju; CASCADE brise dane/obroke/stavke/raspored.
    const brisanje = supabase.from("assigned_nutrition_plans").delete();
    const { error } = await (desktop ? brisanje.eq("id", activePlan.id) : brisanje.eq("athlete_id", id));
    if (error) { toast.error(porukaGreske(error)); return; }
    toast.success(desktop ? "Plan ishrane je uklonjen." : "Plan otkazan");
    load(desktop);
  };

  const callAthlete = () => {
    if (athlete?.phone) window.location.href = `tel:${athlete.phone}`;
    else toast.error("Vežbač nema sačuvan broj");
  };

  const copyEmail = async () => {
    if (!athleteEmail) return;
    try {
      await navigator.clipboard.writeText(athleteEmail);
      toast.success("Email kopiran");
    } catch {
      toast.error("Ne mogu da kopiram");
    }
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

  const membershipDaysLeft = activeMembership?.ends_on
    ? Math.ceil((new Date(activeMembership.ends_on).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const membershipDaysLeftInfo = daysLeftBadge(membershipDaysLeft);
  const membershipPeriodText = activeMembership
    ? activeMembership.starts_on && activeMembership.ends_on
      ? `${fmtShortDate(activeMembership.starts_on)} - ${fmtShortDate(activeMembership.ends_on)}`
      : activeMembership.ends_on
        ? `do ${fmtShortDate(activeMembership.ends_on)}`
        : activeMembership.starts_on
          ? `od ${fmtShortDate(activeMembership.starts_on)}`
          : "Bez datuma"
    : "";

  // Racunar: iste vrednosti koje telefon racuna u liniji, izdvojene jer ih
  // raspored u kolonama koristi na drugom mestu.
  const wearableSyncText = (() => {
    if (!lastWearableSync) return null;
    const diff = Date.now() - new Date(lastWearableSync).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `Sinhronizovano pre ${Math.max(1, m)} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `Sinhronizovano pre ${h} h`;
    return `Sinhronizovano pre ${Math.floor(h / 24)} d`;
  })();

  return (
    <PhoneShell
      back="/trener/vezbaci"
      desktopWidth="wide"
      // Racunar: ime, oznake, dugmad i stanje treninga su u vrhu profila (VrhProfila).
      hideDesktopHeader={desktop}
      action={
        desktop ? undefined : (
          <SendMessageToAthlete athleteId={athlete.id} athleteName={athlete.full_name ?? undefined} variant="icon" />
        )
      }
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
      {desktop ? (
        // Racunar: statistika u redu plocica preko cele sirine, ispod dve kolone -
        // levo ono sto trener menja (planovi, treninzi, zdravlje), desno kontakt,
        // clanarina, merenja i fotke. Na telefonu je sve to jedna duga kolona.
        <div className="space-y-6">
          <VrhProfila
            athlete={athlete}
            stats={stats}
            tezina={latestMetric?.weight_kg ?? athlete.weight_kg}
            sesije={
              activeMembership?.sessions_total
                ? { used: activeMembership.sessions_used, total: activeMembership.sessions_total }
                : null
            }
            akcije={
              <>
                <Link
                  to={`/trener/chat/${athlete.id}`}
                  className="inline-flex h-10 items-center rounded-full border border-hairline bg-surface-2 px-4 text-[13px] font-semibold transition hover:bg-surface"
                >
                  <MessageSquare className="mr-1.5 h-4 w-4" />
                  Poruke
                </Link>
                <Button
                  variant="outline"
                  onClick={guard(() => setUrediOpen(true))}
                  title="Uredi podatke vežbača"
                  className="h-10 rounded-full px-4"
                >
                  <LockMark className="mr-1.5" />
                  <Pencil className="mr-1.5 h-4 w-4" />
                  Uredi podatke
                </Button>
                <Button
                  onClick={guard(() => setUpisujem(true))}
                  className="h-10 rounded-full px-4 bg-gradient-brand text-white shadow-brand"
                >
                  <LockMark className="mr-1.5" />
                  <Plus className="h-4 w-4 mr-1.5" />
                  Upiši trening
                </Button>
              </>
            }
          />
          {stats && stats.success === false ? (
            <Card className="p-6 text-center text-[13px] text-muted-foreground">
              Nema još podataka
            </Card>
          ) : stats ? (
            // Ishrana, ucestalost i paket su prstenovi u vrhu, ovde ostaje jedan red.
            // Kalorije nisu uvek tu, pa kolone dele sirinu ravnomerno.
            <div className="grid grid-cols-2 gap-4 lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr">
              <KpiProfila
                icon={<Dumbbell className="h-4 w-4" />}
                label="Ukupno treninga"
                value={String(stats.total_workouts ?? 0)}
                valueClass="text-gradient-brand"
                sub={`Ovaj mesec: ${stats.workouts_this_month ?? 0}`}
              />
              <KpiProfila
                icon={<Clock className="h-4 w-4" />}
                label="Poslednji trening"
                value={stats.days_since_last == null
                  ? "Nikad"
                  : stats.days_since_last <= 0
                    ? "Danas"
                    : `Pre ${stats.days_since_last} d`}
                sub={stats.days_since_last == null ? "Još nije trenirao" : undefined}
                valueClass={RISK_TEXT[stats.risk] ?? "text-foreground"}
              />
              <KpiProfila
                icon={<Trophy className="h-4 w-4" />}
                label="PR-ovi"
                value={String(stats.pr_count ?? 0)}
                sub={stats.best_e1rm_kg ? `${stats.best_e1rm_kg} kg najjači` : undefined}
              />
              <KpiProfila
                icon={<BarChart3 className="h-4 w-4" />}
                label="Volumen"
                value={fmtVolume(stats.total_volume_kg ?? 0)}
                unit="kg ukupno"
              />
              {stats.kcal_sessions > 0 && (
                <KpiProfila
                  icon={<Flame className="h-4 w-4" />}
                  label="Kalorije"
                  value={Math.round(stats.total_kcal ?? 0).toLocaleString("sr-Latn-RS")}
                  unit="kcal"
                  sub={stats.avg_kcal ? `Prosek po treningu: ${Math.round(stats.avg_kcal)} kcal` : undefined}
                />
              )}
            </div>
          ) : null}

          {athlete.notes?.trim() && (
            <button
              type="button"
              onClick={guard(() => setUrediOpen(true))}
              className="card-premium flex w-full items-start gap-3 p-4 text-left transition hover:bg-surface-2"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning">
                <StickyNote className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Beleška</span>
                <span className="mt-0.5 block whitespace-pre-wrap text-[13.5px] leading-relaxed">{athlete.notes.trim()}</span>
              </span>
              <Pencil className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          )}

          <NapredakPrecice stats={stats} />

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-8">
              {/* Program i ishrana jedno pored drugog: to su dve paralelne stvari
                  koje trener vodi, a kartice iste visine se lako porede. */}
              <div className="grid grid-cols-2 gap-4">
                <div className="card-premium flex min-h-[236px] flex-col p-5">
                  <SectionHead eyebrow="Trening" title="Program" />
                  {activeProgram ? (
                    <>
                      <div className="mt-4 flex items-center gap-3">
                        <div className="h-11 w-11 rounded-xl bg-gradient-brand-soft flex items-center justify-center shrink-0">
                          <Dumbbell className="h-5 w-5 text-primary" strokeWidth={2.25} />
                        </div>
                        <div className="min-w-0 flex-1 font-display text-[17px] font-bold leading-snug tracking-tight line-clamp-2">
                          {activeProgram.name}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className={cn(META_CHIP, "tnum")}>
                          {activeProgram.total_days} {activeProgram.total_days === 1 ? "dan" : "dana"}
                        </span>
                        <span className={cn(META_CHIP, "tnum")}>
                          Dodeljen {new Date(activeProgram.assigned_at).toLocaleDateString("sr-Latn-RS")}
                        </span>
                      </div>
                      <div className="mt-auto space-y-2 pt-5">
                        <Button
                          className="h-10 w-full rounded-full bg-gradient-brand text-white shadow-brand"
                          onClick={() => navigate(`/trener/vezbaci/${id}/program/${activeProgram.id}`)}
                        >
                          Izmeni plan
                        </Button>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" className="h-10 flex-auto rounded-full px-3 text-[13px]" onClick={openProgramAssign}>
                            <LockMark className="mr-1.5" />Promeni program
                          </Button>
                          <Button variant="outline" className="h-10 flex-auto rounded-full px-3 text-[13px]" onClick={startCustomProgram}>
                            <LockMark className="mr-1.5" /><Sparkles className="h-4 w-4 mr-1" /> Nov plan
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-[13px] text-muted-foreground">
                        Vežbač još nema program treninga.
                      </p>
                      <div className="mt-auto space-y-2 pt-5">
                        <Button
                          className="h-10 w-full rounded-full bg-gradient-brand text-white shadow-brand"
                          onClick={startCustomProgram}
                        >
                          <LockMark className="mr-1.5" /><Sparkles className="h-4 w-4 mr-1.5" /> Napravi plan od nule
                        </Button>
                        <Button
                          variant="outline"
                          className="h-10 w-full rounded-full border-dashed"
                          onClick={openProgramAssign}
                        >
                          <LockMark className="mr-1.5" /><Plus className="h-4 w-4 mr-1.5" /> Dodeli gotov program
                        </Button>
                      </div>
                    </>
                  )}
                </div>

                <div className="card-premium flex min-h-[236px] flex-col p-5">
                  <SectionHead
                    eyebrow="Ishrana"
                    title="Plan ishrane"
                    right={
                      activePlan ? (
                        <button
                          onClick={unassignPlan}
                          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold text-muted-foreground transition hover:bg-destructive-soft hover:text-destructive"
                        >
                          <LockMark /><Trash2 className="h-3.5 w-3.5" /> Ukloni plan
                        </button>
                      ) : undefined
                    }
                  />
                  {activePlan ? (
                    <>
                      <div className="mt-4 flex items-center gap-3">
                        <div className="h-11 w-11 rounded-xl bg-gradient-brand-soft flex items-center justify-center shrink-0">
                          <Apple className="h-5 w-5 text-primary" strokeWidth={2.25} />
                        </div>
                        <div className="min-w-0 flex-1 font-display text-[17px] font-bold leading-snug tracking-tight line-clamp-2">
                          {activePlan.name}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {activePlan.target_kcal ? (
                          <span className={cn(META_CHIP_PRIMARY, "tnum")}>{activePlan.target_kcal} kcal</span>
                        ) : null}
                        <span className={cn(META_CHIP, "tnum")}>
                          Dodeljeno {new Date(activePlan.assigned_at).toLocaleDateString("sr-Latn-RS")}
                        </span>
                      </div>
                      <div className="mt-auto space-y-2 pt-5">
                        <Button
                          className="h-10 w-full rounded-full bg-gradient-brand text-white shadow-brand"
                          onClick={() => navigate(`/trener/vezbaci/${id}/ishrana/${activePlan.id}`)}
                        >
                          Izmeni plan ishrane
                        </Button>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" className="h-10 flex-auto rounded-full px-3 text-[13px]" onClick={openAssign}>
                            <LockMark className="mr-1.5" />Promeni plan
                          </Button>
                          <Button variant="outline" className="h-10 flex-auto rounded-full px-3 text-[13px]" onClick={startCustomNutrition}>
                            <LockMark className="mr-1.5" /><Sparkles className="h-4 w-4 mr-1" /> Nov plan
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-[13px] text-muted-foreground">
                        Vežbač još nema plan ishrane.
                      </p>
                      <div className="mt-auto space-y-2 pt-5">
                        <Button
                          className="h-10 w-full rounded-full bg-gradient-brand text-white shadow-brand"
                          onClick={startCustomNutrition}
                        >
                          <LockMark className="mr-1.5" /><Sparkles className="h-4 w-4 mr-1.5" /> Napravi plan od nule
                        </Button>
                        <Button
                          variant="outline"
                          className="h-10 w-full rounded-full border-dashed"
                          onClick={openAssign}
                        >
                          <LockMark className="mr-1.5" /><Plus className="h-4 w-4 mr-1.5" /> Dodeli gotov plan
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {id && (
                <div className="space-y-2 empty:hidden">
                  <NacrtPlana vrsta="program" athleteId={id} kljuc={nacrtKljuc} />
                  <NacrtPlana vrsta="ishrana" athleteId={id} kljuc={nacrtKljuc} />
                </div>
              )}

              {/* Merenja imaju svoj deo sa naslovom, odmah ispod planova. */}
              {id && (
                <div id={ID_DELOVA.merenja} className="scroll-mt-6">
                  <MerenjaVezbaca athleteId={id} onPromena={() => void load(true)} />
                </div>
              )}

              {/* Treninzi: tabovi stoje u redu sa naslovom; upis treninga je dugme u
                  zaglavlju stranice, pa ga ovde nema. */}
              <section id={ID_DELOVA.treninzi} className="scroll-mt-6">
                <Tabs defaultValue="app" className="w-full">
                  <SectionHead
                    eyebrow="Aktivnost"
                    title="Treninzi"
                    right={
                      <TabsList className="h-10 shrink-0 rounded-full p-1">
                        <TabsTrigger
                          value="app"
                          className="rounded-full px-4 data-[state=active]:bg-gradient-brand data-[state=active]:text-white data-[state=active]:shadow-brand"
                        >
                          Iz aplikacije
                        </TabsTrigger>
                        <TabsTrigger
                          value="watch"
                          className="rounded-full px-4 data-[state=active]:bg-gradient-brand data-[state=active]:text-white data-[state=active]:shadow-brand"
                        >
                          Sa sata
                        </TabsTrigger>
                      </TabsList>
                    }
                  />
                  <div className="mt-3">
                    <TreninziNapredak volumeni={volumeni} stats={stats} />
                  </div>
                  <TabsContent value="app" className="mt-3">
                    <p className="text-xs text-muted-foreground mb-3">
                      Treninzi koje je vežbač radio kroz FitLink. Ako je nosio sat, puls i kalorije su već ovde.
                    </p>
                    {id && <InAppWorkoutsList key={upisKey} athleteId={id} limit={treningaLimit} />}
                    {Number(stats?.total_workouts ?? 0) > treningaLimit && (
                      <Button
                        variant="outline"
                        onClick={() => setTreningaLimit((n) => n + 20)}
                        className="mt-3 h-10 w-full rounded-full"
                      >
                        Prikaži još
                      </Button>
                    )}
                  </TabsContent>
                  <TabsContent value="watch" className="mt-3">
                    <p className="text-xs text-muted-foreground mb-3">
                      Aktivnosti koje je vežbač radio bez FitLink-a, direktno na satu.
                    </p>
                    {/* Bez provere veze: treninzi ostaju i kad vezbac iskljuci sat. */}
                    {id && (
                      <WorkoutsList
                        userId={id}
                        limit={30}
                        stranicenje
                        prazno="Vežbač nema treninge sa sata ni iz aplikacije Zdravlje."
                      />
                    )}
                  </TabsContent>
                </Tabs>
              </section>

              {id && volumeni != null && volumeni.length > 0 && (
                <section className="space-y-2">
                  <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Podeli</h2>
                  <PodeliMesec athleteId={id} />
                </section>
              )}

              <section id={ID_DELOVA.zdravlje} className="scroll-mt-6 space-y-3">
                <SectionHead
                  eyebrow="Sat i traka"
                  title="Zdravlje"
                  right={
                    wearableSyncText ? (
                      <div className="shrink-0 text-[11px] text-muted-foreground">{wearableSyncText}</div>
                    ) : undefined
                  }
                />
                {id && <ZdravljeVezbaca athleteId={id} povezan={hasWearable} />}
                {hasWearable && id && (
                  <div className="grid grid-cols-2 gap-4">
                    <WearableTrendChart userId={id} dataType="heart_rate_avg" days={30} title="Prosečan puls, poslednjih 30 dana" />
                    <WearableTrendChart userId={id} dataType="workout_duration" days={30} title="Trajanje treninga, poslednjih 30 dana" />
                  </div>
                )}
              </section>
            </div>

            <div className="min-w-0 space-y-4">
              <div className="card-premium p-5">
                <SectionHead eyebrow="Vežbač" title="Kontakt" />
                <div className="mt-3 divide-y divide-hairline">
                  {athleteEmail && (
                    <div className="flex items-center gap-3 py-3">
                      <div className="h-9 w-9 rounded-xl bg-primary-soft text-primary flex items-center justify-center shrink-0">
                        <Mail className="h-4 w-4" strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-muted-foreground">Mejl</div>
                        {/* Dug email se prelama, nikad "..."; kopiranje uvek uzima ceo. */}
                        <div className="text-[13.5px] font-medium leading-snug [overflow-wrap:anywhere]">{athleteEmail}</div>
                      </div>
                      <button
                        type="button"
                        onClick={copyEmail}
                        className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary-soft transition active:scale-90"
                        aria-label="Kopiraj email"
                        title="Kopiraj email"
                      >
                        <Copy className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-3 py-3">
                    <div className="h-9 w-9 rounded-xl bg-surface-2 text-foreground flex items-center justify-center shrink-0">
                      <Phone className="h-4 w-4" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-muted-foreground">Telefon</div>
                      <div className="truncate text-[13.5px] font-medium tnum">{athlete.phone ?? "Nije unet"}</div>
                    </div>
                    {athlete.phone && (
                      <Button variant="outline" onClick={callAthlete} className="h-8 shrink-0 rounded-full px-3 text-[12.5px]">
                        Pozovi
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 py-3">
                    <div className="h-9 w-9 rounded-xl bg-surface-2 text-foreground flex items-center justify-center shrink-0">
                      <Calendar className="h-4 w-4" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-muted-foreground">Pridružen</div>
                      <div className="text-[13.5px] font-medium tnum">
                        {new Date(athlete.joined_at).toLocaleDateString("sr-Latn-RS", { day: "numeric", month: "long", year: "numeric" })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {clanarinaPoznata && (
                <ClanarinaVezbaca
                  clanarina={activeMembership}
                  onIzmeni={() => { setNovaClanarina(false); setMembershipEditOpen(true); }}
                  onBonus={() => { setBonusCount("1"); setBonusOpen(true); }}
                  onNova={() => { setNovaClanarina(true); setMembershipEditOpen(true); }}
                  onPromena={() => void load(true)}
                />
              )}

              {id && (
                <div id={ID_DELOVA.fotografije} className="scroll-mt-6">
                  <FotografijeVezbaca athleteId={id} />
                </div>
              )}

              <button
                onClick={guard(() => setRemoveOpen(true))}
                className="w-full flex items-center justify-center gap-2 rounded-full border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 text-destructive py-2.5 text-[13px] font-semibold transition"
              >
                <LockMark />
                <UserMinus className="h-4 w-4" />
                Ukloni vežbača
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
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

            {/* Email - zaseban red pune sirine (ne u uskoj koloni pored avatara). Tekst uzima svu
                sirinu i PRELAMA se ako je dug (nikad iza "..."); copy uvek kopira ceo email. */}
            {athleteEmail && (
              <div className="mt-4 flex items-center gap-2 rounded-2xl bg-surface/70 backdrop-blur border border-hairline px-3 py-2.5">
                <Mail className="h-4 w-4 text-primary shrink-0" strokeWidth={2} />
                <span className="flex-1 min-w-0 text-[13px] leading-snug text-foreground break-all">
                  {athleteEmail}
                </span>
                <button
                  type="button"
                  onClick={copyEmail}
                  className="shrink-0 h-8 w-8 -mr-1 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary-soft transition active:scale-90"
                  aria-label="Kopiraj email"
                >
                  <Copy className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 mt-5">
              <SendMessageToAthlete athleteId={athlete.id} athleteName={athlete.full_name ?? undefined} variant="stacked" />
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

          <AktivanTreningBaner athleteId={athlete.id} athleteName={athlete.full_name} />

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
                      <LockMark className="mr-1.5" />Promeni program
                    </Button>
                    <Button variant="outline" className="w-full" onClick={startCustomProgram}>
                      <LockMark className="mr-1.5" /><Sparkles className="h-4 w-4 mr-1.5" /> Nov plan
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <div className="space-y-2">
                <Button
                  className="w-full h-12 bg-gradient-brand text-white shadow-brand"
                  onClick={startCustomProgram}
                >
                  <LockMark className="mr-1.5" /><Sparkles className="h-4 w-4 mr-1.5" /> Napravi plan od nule
                </Button>
                <button
                  onClick={openProgramAssign}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline hover:border-primary/40 hover:bg-primary-soft/40 py-4 text-[14px] font-semibold text-muted-foreground hover:text-primary-soft-foreground transition"
                >
                  <LockMark /><Plus className="h-4 w-4" /> Dodeli gotov program
                </button>
              </div>
            )}
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
                <div className="mt-3 flex flex-col gap-2">
                  <Button
                    className="w-full bg-gradient-brand text-white shadow-brand"
                    onClick={() => navigate(`/trener/vezbaci/${id}/ishrana/${activePlan.id}`)}
                  >
                    Izmeni plan ishrane
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="w-full" onClick={openAssign}>
                      <LockMark className="mr-1.5" />Promeni plan
                    </Button>
                    <Button variant="outline" className="w-full" onClick={startCustomNutrition}>
                      <LockMark className="mr-1.5" /><Sparkles className="h-4 w-4 mr-1.5" /> Nov plan
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <div className="space-y-2">
                <Button
                  className="w-full h-12 bg-gradient-brand text-white shadow-brand"
                  onClick={startCustomNutrition}
                >
                  <LockMark className="mr-1.5" /><Sparkles className="h-4 w-4 mr-1.5" /> Napravi plan ishrane od nule
                </Button>
                <button
                  onClick={openAssign}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline hover:border-primary/40 hover:bg-primary-soft/40 py-4 text-[14px] font-semibold text-muted-foreground hover:text-primary-soft-foreground transition"
                >
                  <LockMark /><Plus className="h-4 w-4" /> Dodeli gotov plan
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
                      {latestMetric.weight_kg ? `${latestMetric.weight_kg} kg` : "-"}
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
                  Treninzi koje je vežbač radio kroz FitLink. Ako je nosio sat, puls i kalorije su već ovde.
                </p>
                {/* Za trening odradjen bez telefona. Sesija koju ovo pravi je zavrsena
                    od rodjenja i nema zivi red, pa ne moze da dotakne trening u toku. */}
                <button
                  type="button"
                  onClick={guard(() => setUpisujem(true))}
                  className="mb-3 h-10 w-full rounded-xl border border-hairline bg-surface-2 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 transition"
                >
                  <LockMark />
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
                  Upiši trening bez telefona
                </button>
                {id && <InAppWorkoutsList key={upisKey} athleteId={id} limit={10} />}
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
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <Chip tone={STATUS_TONE[activeMembership.status] ?? "muted"}>
                    {STATUS_LABEL[activeMembership.status] ?? activeMembership.status}
                  </Chip>
                  <Chip tone={membershipDaysLeftInfo.tone}>{membershipDaysLeftInfo.label}</Chip>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] text-muted-foreground">{membershipPeriodText}</span>
                {activeMembership.price != null && (
                  <span className="font-display text-[15px] font-bold tracking-tight text-foreground tnum shrink-0">
                    {activeMembership.price.toLocaleString("sr-Latn-RS")} RSD
                  </span>
                )}
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

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={guard(() => setBonusOpen(true), OBLASTI.naplata)}
                  className="w-full"
                >
                  <LockMark className="mr-1.5" /><Plus className="h-4 w-4 mr-1.5" /> Dodaj bonus
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={guard(() => setMembershipEditOpen(true), OBLASTI.naplata)}
                  className="w-full"
                >
                  <LockMark className="mr-1.5" /><Pencil className="h-4 w-4 mr-1.5" /> Izmeni
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="p-5 space-y-3 text-center">
              <p className="text-[13px] text-muted-foreground">
                Vežbač nema članarinu. Kad izabere paket, pojaviće se u{" "}
                <Link to="/trener/uplate" className="text-primary font-semibold">
                  Zahtevima za uplatu
                </Link>
                .
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={guard(() => setMembershipEditOpen(true), OBLASTI.naplata)}
                className="w-full"
              >
                <LockMark className="mr-1.5" /><Plus className="h-4 w-4 mr-1.5" /> Dodaj članarinu
              </Button>
            </Card>
          )}
        </>
      )}

      {/* Upis treninga koji je vezbac odradio bez telefona. Stoji ovde, uz ostale
          sheet-ove glavnog prikaza - u grani za ucitavanje ga nema ko otvoriti. */}
      {id && (
        <UpisTreninga
          open={upisujem}
          onClose={() => setUpisujem(false)}
          athleteId={id}
          athleteName={athlete?.full_name ?? null}
          onSaved={() => setUpisKey((n) => n + 1)}
        />
      )}

      {desktop && id && (
        <UrediVezbacaSheet
          open={urediOpen}
          onClose={() => setUrediOpen(false)}
          vezbacId={id}
          ime={athlete?.full_name ?? "Vežbač"}
          onSacuvano={() => void load(true)}
        />
      )}

      <MembershipEditSheet
        open={membershipEditOpen}
        onClose={() => { setMembershipEditOpen(false); setNovaClanarina(false); }}
        membershipId={novaClanarina ? null : activeMembership?.id ?? null}
        athleteId={id}
        onSaved={() => load(desktop)}
      />

      {/* Bonus sheet */}
      <FullScreenSheet open={bonusOpen} onClose={() => setBonusOpen(false)} title="Dodaj bonus treninge">
        <FullScreenSheetScroll className="pt-5 space-y-3">
          <p className="text-[13px] text-muted-foreground">
            {desktop
              ? "Dodaje treninge na aktivnu članarinu, bez promene datuma."
              : "Dodato će se na trenutnu članarinu, bez plaćanja."}
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

      {/* Nov plan ishrane od nule - naziv (isti obrazac kao trening custom) */}
      <FullScreenSheet open={customNutOpen} onClose={() => setCustomNutOpen(false)} title="Nov plan ishrane">
        <form onSubmit={createCustomNutrition} className="flex flex-1 min-h-0 flex-col">
          <FullScreenSheetScroll className="pt-5 space-y-3">
            <p className="text-[13px] text-muted-foreground">
              Prazan plan ishrane koji praviš direktno za ovog vežbača. Posle naziva dodaješ dane, obroke i namirnice.
            </p>
            <div>
              <Label htmlFor="custom-nut-name">Naziv plana</Label>
              <Input
                id="custom-nut-name"
                value={customNutName}
                onChange={(e) => setCustomNutName(e.target.value)}
                placeholder="npr. Definicija 2000 kcal"
                className="mt-1.5 h-14 text-base rounded-2xl"
                autoFocus
              />
            </div>
          </FullScreenSheetScroll>
          <FullScreenSheetFooter>
            <Button type="submit" disabled={customNutCreating} className="w-full bg-gradient-brand text-white shadow-brand">
              {customNutCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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
            {desktop && (
              <p className="text-[13px] text-muted-foreground">Novi plan zamenjuje trenutni plan ishrane.</p>
            )}
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
                        {t.target_kcal ? `${t.target_kcal} kcal` : "-"}
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

      {!desktop && (
        <section className="pt-2">
          <button
            onClick={guard(() => setRemoveOpen(true))}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 text-destructive py-3.5 text-[13.5px] font-semibold transition"
          >
            <LockMark />
            <UserMinus className="h-4 w-4" />
            Ukloni vežbača
          </button>
        </section>
      )}

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {desktop ? `Ukloniti ${athlete?.full_name ?? "vežbača"} iz tvojih vežbača?` : "Ukloniti vežbača?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {desktop
                ? "Nalog vežbača ostaje, samo više nije povezan sa tobom. Zakazani termini se otkazuju."
                : `${athlete?.full_name ?? "Vežbač"} će biti uklonjen sa tvog spiska. Njegov nalog i istorija treninga se čuvaju. Možeš ga ponovo dodati pozivnicom kasnije.`}
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

      {/* Zapocet draft: Nastavi ili Napravi nov */}
      <AlertDialog open={!!draftResume} onOpenChange={(o) => { if (!o) setDraftResume(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Imaš započet plan</AlertDialogTitle>
            <AlertDialogDescription>
              Plan "{draftResume?.draftName}" je sačuvan ali nije poslat vežbaču. Nastaviti ga ili napraviti nov?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:gap-2">
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); continueDraft(); }}
              className="w-full bg-gradient-brand text-white shadow-brand"
            >
              Nastavi
            </AlertDialogAction>
            <Button variant="outline" className="w-full" onClick={makeNewFromDraft}>
              Napravi nov
            </Button>
            <AlertDialogCancel className="w-full mt-0">Otkaži</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PhoneShell>
  );
};

// Racunar: plocica sa brojem (isti jezik kao pocetna).
const KpiProfila = ({
  label, value, unit, sub, valueClass, icon,
}: {
  label: string; value: string; unit?: string; sub?: string; valueClass?: string; icon: ReactNode;
}) => (
  <div className="card-premium px-[18px] pb-3.5 pt-4">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{label}</span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
        {icon}
      </span>
    </div>
    <div className="mt-2 flex items-baseline gap-1.5">
      <span className={cn("fig whitespace-nowrap text-[30px] leading-none", valueClass ?? "text-foreground")}>{value}</span>
      {unit && <span className="text-[11.5px] text-muted-foreground">{unit}</span>}
    </div>
    {sub && <div className="mt-1.5 text-[11.5px] text-muted-foreground">{sub}</div>}
  </div>
);

// Racunar: prsten sa brojem i opisom (vrh profila).
const Prsten = ({ deo, boja, broj, opis }: { deo: number; boja: string; broj: string; opis: string }) => {
  const obim = 2 * Math.PI * 19;
  const d = Math.max(0, Math.min(1, deo)) * obim;
  return (
    <div className="flex items-center gap-3">
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden className="shrink-0">
        <circle cx="24" cy="24" r="19" fill="none" stroke="hsl(0 0% 100% / 0.1)" strokeWidth="5" />
        <circle
          cx="24" cy="24" r="19" fill="none" stroke={boja} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${d} ${obim}`} transform="rotate(-90 24 24)"
        />
      </svg>
      <div>
        <b className="block whitespace-nowrap text-[13px] font-semibold tnum">{broj}</b>
        <small className="block whitespace-nowrap text-[11.5px] text-muted-foreground">{opis}</small>
      </div>
    </div>
  );
};

// Racunar: vrh profila iz mockupa. Levo ime, oznake i prstenovi, desno slika
// (ili inicijali) sa staklenom karticom: trening u toku ili poslednji trening.
const VrhProfila = ({
  athlete,
  stats,
  sesije,
  akcije,
  tezina,
}: {
  athlete: AthleteData;
  stats: any | null;
  sesije: { used: number; total: number } | null;
  akcije: ReactNode;
  /** Poslednje merenje ako postoji, inace tezina iz profila. */
  tezina: number | null;
}) => {
  const { sesija, now, ocisti } = useAktivnaSesija(athlete.id);
  const puls = usePulsUzivo(athlete.id, !!sesija);
  const traje = sesija ? now - new Date(sesija.started_at).getTime() : 0;
  const zaboravljen = traje >= ZABORAVLJEN_POSLE_MS;
  const imaStat = stats && stats.success !== false;
  const nedeljno = Number(stats?.weekly_avg ?? 0);
  const ishrana = Number(stats?.nutrition_days_30 ?? 0);
  const poslednji =
    !imaStat || stats.days_since_last == null
      ? "Još nije trenirao"
      : stats.days_since_last <= 0
        ? "Danas"
        : stats.days_since_last === 1
          ? "Juče"
          : `Pre ${stats.days_since_last} dana`;
  return (
    <section
      className="relative grid min-h-[214px] grid-cols-[minmax(0,1fr)_300px] overflow-hidden rounded-[28px] border border-hairline bg-surface"
    >
      <div className="flex flex-col justify-between gap-5 px-7 py-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/trener/vezbaci"
              aria-label="Nazad"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-2 transition hover:bg-surface active:scale-95"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
            </Link>
            <span className="whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
              Profil vežbača
            </span>
            <span className="flex-1" />
            <div className="flex flex-wrap items-center gap-2">{akcije}</div>
          </div>
          <h1 className="mt-3 font-display text-[32px] font-bold leading-[1.05] tracking-[-0.03em]">
            {athlete.full_name ?? "Bez imena"}
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {ciljNaziv(athlete.goal) && (
              <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary-soft-foreground">
                {ciljNaziv(athlete.goal)}
              </span>
            )}
            {tezina ? (
              <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-muted-foreground tnum">
                {String(tezina).replace(".", ",")} kg
              </span>
            ) : null}
            {athlete.height_cm ? (
              <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-muted-foreground tnum">
                {athlete.height_cm} cm
              </span>
            ) : null}
            <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-muted-foreground tnum">
              Pridružen {new Date(athlete.joined_at).toLocaleDateString("sr-Latn-RS", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>
        </div>
        {imaStat && (
          <div className="flex flex-wrap gap-x-7 gap-y-3">
            {sesije && (
              <Prsten
                deo={sesije.used / sesije.total}
                boja="hsl(var(--primary-soft-foreground))"
                broj={`${sesije.used} / ${sesije.total}`}
                opis="iskorišćeno sesija"
              />
            )}
            <Prsten deo={ishrana / 30} boja="hsl(var(--success))" broj={`${ishrana} / 30 dana`} opis="ishrana upisana" />
            <Prsten
              deo={nedeljno / 4}
              boja="hsl(var(--warning))"
              broj={`${nedeljno.toLocaleString("sr-Latn-RS", { maximumFractionDigits: 1 })} nedeljno`}
              opis="učestalost"
            />
          </div>
        )}
      </div>
      <div
        className="relative bg-cover bg-center"
        style={
          athlete.avatar_url
            ? { backgroundImage: `url(${athlete.avatar_url})` }
            : { background: "linear-gradient(135deg, hsl(267 81% 58% / 0.55), hsl(323 72% 59% / 0.35))" }
        }
      >
        {!athlete.avatar_url && (
          // Donji deo zauzima kartica stanja, pa inicijali uvek stoje iznad nje.
          <span className="absolute inset-0 flex items-start justify-center pt-5 font-display text-[84px] font-bold leading-none tracking-[-0.04em] text-white/85">
            {initialsOf(athlete.full_name)}
          </span>
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,hsl(var(--surface))_0%,hsl(var(--surface)/0.55)_38%,transparent_75%)]" />
        {sesija ? (
          // Trening u toku: uvek i Uzivo i Zaustavi (trener na racunaru inace ne nalazi zaustavljanje).
          <div className="absolute inset-x-4 bottom-4 rounded-[18px] bg-background/60 px-3.5 py-3 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.14)] backdrop-blur-xl">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-success" />
              </span>
              <div className="min-w-0">
                <b className="block text-[13px] font-semibold">Trenira sada</b>
                <small className={cn("block text-[10.5px] tnum", zaboravljen ? "text-destructive" : "text-muted-foreground")}>
                  traje {formatDuration(traje)}
                  {zaboravljen && ", možda nije ugašen"}
                </small>
              </div>
              {puls != null && (
                <span className="ml-auto inline-flex items-center gap-1 text-success">
                  <Heart className="h-3.5 w-3.5 fill-current" />
                  <b className="fig text-[16px] leading-none">{puls}</b>
                </span>
              )}
            </div>
            <div className="mt-2.5 flex gap-2">
              <Link
                to={`/trener/vezbac/${athlete.id}/live`}
                className="inline-flex h-8 flex-1 items-center justify-center rounded-full bg-white px-3 text-[12.5px] font-semibold text-background"
              >
                Uživo
              </Link>
              <ZaustaviTreningDugme sessionId={sesija.id} athleteName={athlete.full_name} onStopped={ocisti} className="flex-1" />
            </div>
          </div>
        ) : (
          <div className="absolute bottom-4 right-4 rounded-[18px] bg-background/60 px-3.5 py-2.5 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.14)] backdrop-blur-xl">
            <small className="block whitespace-nowrap text-[10.5px] text-muted-foreground">Poslednji trening</small>
            <b className="block whitespace-nowrap text-[13px] font-semibold">{poslednji}</b>
          </div>
        )}
      </div>
    </section>
  );
};

export default AthleteProfile;
