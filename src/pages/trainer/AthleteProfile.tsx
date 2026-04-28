import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { PhoneShell } from "@/components/PhoneShell";
import { Avatar, Card, Chip } from "@/components/ui-bits";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Apple, ClipboardList, Wallet, MessageSquare, Phone, Loader2, Plus, X, Check,
  Dumbbell, TrendingUp, Activity, Scale,
} from "lucide-react";
import { toast } from "sonner";

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
  created_at: string;
  total_days: number;
};

type ProgramTemplate = {
  id: string;
  name: string;
  goal: string | null;
};

type SessionLog = {
  id: string;
  day_number: number;
  completed_at: string | null;
  duration_seconds: number | null;
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

const AthleteProfile = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [athlete, setAthlete] = useState<AthleteData | null>(null);
  const [activePlan, setActivePlan] = useState<AssignedPlan | null>(null);

  // Assign dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [templates, setTemplates] = useState<NutritionTemplate[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);

    const [aRes, pRes, planRes] = await Promise.all([
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
    ]);

    if (aRes.data) {
      setAthlete({
        ...(aRes.data as any),
        full_name: (pRes.data as any)?.full_name ?? null,
        phone: (pRes.data as any)?.phone ?? null,
      });
    }
    setActivePlan((planRes.data as any) ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

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
      // 1) Učitaj kompletan template
      const [tRes, dRes, schedRes] = await Promise.all([
        supabase.from("nutrition_plan_templates").select("*").eq("id", templateId).maybeSingle(),
        supabase.from("nutrition_plan_days").select("*").eq("template_id", templateId).order("day_number"),
        supabase.from("nutrition_plan_week_schedule").select("weekday, day_id").eq("template_id", templateId),
      ]);
      const tpl: any = tRes.data;
      if (!tpl) throw new Error("Template ne postoji");

      const days: any[] = (dRes.data as any) ?? [];
      const dayIds = days.map((d) => d.id);

      const [mRes] = await Promise.all([
        dayIds.length
          ? supabase.from("nutrition_plan_meals").select("*").in("day_id", dayIds).order("meal_order")
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const meals: any[] = (mRes.data as any) ?? [];
      const mealIds = meals.map((m) => m.id);

      const itemsRes = mealIds.length
        ? await supabase
            .from("nutrition_plan_meal_items")
            .select("*")
            .in("meal_id", mealIds)
            .order("item_order")
        : { data: [] as any[] };
      const items: any[] = (itemsRes.data as any) ?? [];

      // 2) Deaktiviraj postojeće aktivne planove vežbača
      await supabase
        .from("assigned_nutrition_plans")
        .update({ is_active: false } as any)
        .eq("athlete_id", id)
        .eq("is_active", true);

      // 3) Insert assigned_nutrition_plan (snapshot root)
      const { data: assignedPlan, error: apErr } = await supabase
        .from("assigned_nutrition_plans")
        .insert({
          athlete_id: id,
          trainer_id: user.id,
          template_id: templateId,
          name: tpl.name,
          goal: tpl.goal,
          target_kcal: tpl.target_kcal,
          target_protein: tpl.target_protein,
          target_carbs: tpl.target_carbs,
          target_fat: tpl.target_fat,
          notes: tpl.notes,
          is_active: true,
        } as any)
        .select("id")
        .single();
      if (apErr) throw apErr;
      const assignedPlanId = (assignedPlan as any).id;

      // 4) Insert days (mapiraj stari day.id → novi)
      const dayIdMap = new Map<string, string>();
      if (days.length) {
        const dayInserts = days.map((d) => ({
          assigned_plan_id: assignedPlanId,
          day_number: d.day_number,
          name: d.name,
        }));
        const { data: newDays, error: dErr } = await supabase
          .from("assigned_nutrition_days")
          .insert(dayInserts as any)
          .select("id, day_number");
        if (dErr) throw dErr;
        days.forEach((oldD) => {
          const newD = (newDays as any[]).find((nd) => nd.day_number === oldD.day_number);
          if (newD) dayIdMap.set(oldD.id, newD.id);
        });
      }

      // 5) Insert meals
      const mealIdMap = new Map<string, string>();
      if (meals.length) {
        const mealInserts = meals
          .map((m) => ({
            day_id: dayIdMap.get(m.day_id),
            meal_order: m.meal_order,
            name: m.name,
            time_hint: m.time_hint,
            _origId: m.id,
          }))
          .filter((m) => m.day_id);
        // Insert one-by-one to keep mapping (or batch + match by day_id+meal_order)
        const { data: newMeals, error: mErr } = await supabase
          .from("assigned_nutrition_meals")
          .insert(mealInserts.map(({ _origId, ...rest }) => rest) as any)
          .select("id, day_id, meal_order");
        if (mErr) throw mErr;
        meals.forEach((oldM) => {
          const newDayId = dayIdMap.get(oldM.day_id);
          const match = (newMeals as any[]).find(
            (nm) => nm.day_id === newDayId && nm.meal_order === oldM.meal_order,
          );
          if (match) mealIdMap.set(oldM.id, match.id);
        });
      }

      // 6) Insert meal items
      if (items.length) {
        const itemInserts = items
          .map((it) => ({
            meal_id: mealIdMap.get(it.meal_id),
            food_id: it.food_id,
            grams: it.grams,
            item_order: it.item_order,
          }))
          .filter((it) => it.meal_id);
        if (itemInserts.length) {
          const { error: iErr } = await supabase
            .from("assigned_nutrition_meal_items")
            .insert(itemInserts as any);
          if (iErr) throw iErr;
        }
      }

      // 7) Week schedule
      const sched: any[] = (schedRes.data as any) ?? [];
      if (sched.length) {
        const schedInserts = sched
          .map((s) => ({
            assigned_plan_id: assignedPlanId,
            weekday: s.weekday,
            day_id: dayIdMap.get(s.day_id),
          }))
          .filter((s) => s.day_id);
        if (schedInserts.length) {
          await supabase.from("assigned_nutrition_week_schedule").insert(schedInserts as any);
        }
      }

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
    if (!confirm("Otkazati aktivni plan ishrane?")) return;
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
              Pridružen {new Date(athlete.joined_at).toLocaleDateString("sr-RS")}
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
          <Link
            to="/trener/programi"
            className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-surface/80 backdrop-blur hover:bg-surface transition"
          >
            <ClipboardList className="h-4 w-4 text-foreground" strokeWidth={2} />
            <span className="text-[11px] font-semibold">Program</span>
          </Link>
        </div>
      </Card>

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
                  Dodeljeno {new Date(activePlan.assigned_at).toLocaleDateString("sr-RS")}
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

      {/* Action */}
      <Link
        to={`/trener/uplata/${athlete.id}`}
        className="flex items-center justify-between card-premium-hover px-5 py-4"
      >
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-success-soft text-success-soft-foreground flex items-center justify-center">
            <Wallet className="h-[18px] w-[18px]" strokeWidth={2} />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight">Evidentiraj uplatu</div>
            <div className="text-[12.5px] text-muted-foreground">Mesečna članarina</div>
          </div>
        </div>
        <span className="text-muted-foreground">→</span>
      </Link>

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
    </PhoneShell>
  );
};

export default AthleteProfile;
