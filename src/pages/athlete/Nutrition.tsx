import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Apple, Plus, Loader2, Search, Trash2, Flame } from "lucide-react";
import { toast } from "sonner";

type Plan = {
  id: string;
  name: string;
  target_kcal: number | null;
  target_protein: number | null;
  target_carbs: number | null;
  target_fat: number | null;
  notes: string | null;
};
type Day = { id: string; day_number: number; name: string };
type Meal = { id: string; day_id: string; meal_order: number; name: string; time_hint: string | null };
type Food = { id: string; name: string; kcal_per_100g: number; protein_per_100g: number; carbs_per_100g: number; fat_per_100g: number };
type MealItem = { id: string; meal_id: string; grams: number; food_items: Food | null };
type Log = {
  id: string;
  meal_name: string | null;
  custom_food_name: string | null;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  food_items: { name: string } | null;
};

const macros = (it: MealItem) => {
  const f = it.food_items;
  if (!f) return { kcal: 0, p: 0, c: 0, fat: 0 };
  const r = it.grams / 100;
  return {
    kcal: Math.round(f.kcal_per_100g * r),
    p: Math.round(f.protein_per_100g * r * 10) / 10,
    c: Math.round(f.carbs_per_100g * r * 10) / 10,
    fat: Math.round(f.fat_per_100g * r * 10) / 10,
  };
};

const Nutrition = () => {
  const { user } = useAuth();
  const today = new Date();
  const weekday = today.getDay(); // 0 ned ... 6 sub
  const todayStr = today.toISOString().slice(0, 10);

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [day, setDay] = useState<Day | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [itemsByMeal, setItemsByMeal] = useState<Record<string, MealItem[]>>({});
  const [logs, setLogs] = useState<Log[]>([]);

  // Log dialog
  const [logOpen, setLogOpen] = useState(false);
  const [foods, setFoods] = useState<Food[]>([]);
  const [foodQuery, setFoodQuery] = useState("");
  const [pickedFood, setPickedFood] = useState<Food | null>(null);
  const [pickedGrams, setPickedGrams] = useState("100");
  const [pickedMealName, setPickedMealName] = useState("");

  const load = async () => {
    if (!user) return;
    setLoading(true);

    const { data: planData } = await supabase
      .from("assigned_nutrition_plans")
      .select("*")
      .eq("athlete_id", user.id)
      .eq("is_active", true)
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planData) {
      setPlan(planData as any);

      // Find today's day via schedule
      const { data: sched } = await supabase
        .from("assigned_nutrition_week_schedule")
        .select("day_id")
        .eq("assigned_plan_id", (planData as any).id)
        .eq("weekday", weekday)
        .maybeSingle();

      let dayId = (sched as any)?.day_id ?? null;

      // Fallback: prvi dan plana
      if (!dayId) {
        const { data: firstDay } = await supabase
          .from("assigned_nutrition_days")
          .select("id")
          .eq("assigned_plan_id", (planData as any).id)
          .order("day_number")
          .limit(1)
          .maybeSingle();
        dayId = (firstDay as any)?.id ?? null;
      }

      if (dayId) {
        const { data: dayData } = await supabase
          .from("assigned_nutrition_days").select("*").eq("id", dayId).maybeSingle();
        setDay(dayData as any);

        const { data: mealsData } = await supabase
          .from("assigned_nutrition_meals")
          .select("*")
          .eq("day_id", dayId)
          .order("meal_order");
        setMeals((mealsData as any) ?? []);

        const mealIds = (mealsData ?? []).map((m: any) => m.id);
        if (mealIds.length) {
          const { data: items } = await supabase
            .from("assigned_nutrition_meal_items")
            .select("*, food_items(*)")
            .in("meal_id", mealIds)
            .order("item_order");
          const grouped: Record<string, MealItem[]> = {};
          (items ?? []).forEach((it: any) => {
            grouped[it.meal_id] = grouped[it.meal_id] ?? [];
            grouped[it.meal_id].push(it);
          });
          setItemsByMeal(grouped);
        }
      } else {
        setDay(null); setMeals([]); setItemsByMeal({});
      }
    }

    // Today's logs
    const { data: logsData } = await supabase
      .from("nutrition_logs")
      .select("*, food_items(name)")
      .eq("athlete_id", user.id)
      .eq("log_date", todayStr)
      .order("created_at", { ascending: false });
    setLogs((logsData as any) ?? []);

    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const loadFoods = async () => {
    const { data } = await supabase
      .from("food_items")
      .select("id, name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g")
      .order("name");
    setFoods((data as any) ?? []);
  };

  const openLog = async (mealName?: string) => {
    setPickedMealName(mealName ?? "");
    setPickedFood(null);
    setPickedGrams("100");
    setFoodQuery("");
    setLogOpen(true);
    if (foods.length === 0) await loadFoods();
  };

  const addLog = async () => {
    if (!user || !pickedFood) return;
    const grams = parseFloat(pickedGrams);
    if (!grams || grams <= 0) { toast.error("Unesi gramažu"); return; }
    const r = grams / 100;
    const { error } = await supabase.from("nutrition_logs").insert({
      athlete_id: user.id,
      log_date: todayStr,
      meal_name: pickedMealName || null,
      food_id: pickedFood.id,
      grams,
      kcal: Math.round(pickedFood.kcal_per_100g * r),
      protein: Math.round(pickedFood.protein_per_100g * r * 10) / 10,
      carbs: Math.round(pickedFood.carbs_per_100g * r * 10) / 10,
      fat: Math.round(pickedFood.fat_per_100g * r * 10) / 10,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Logovano");
    setLogOpen(false);
    load();
  };

  const removeLog = async (logId: string) => {
    await supabase.from("nutrition_logs").delete().eq("id", logId);
    load();
  };

  const filteredFoods = useMemo(() => {
    if (!foodQuery) return foods;
    const q = foodQuery.toLowerCase();
    return foods.filter((f) => f.name.toLowerCase().includes(q));
  }, [foods, foodQuery]);

  const consumed = useMemo(() => {
    let kcal = 0, p = 0, c = 0, fat = 0;
    logs.forEach((l) => { kcal += Number(l.kcal); p += Number(l.protein); c += Number(l.carbs); fat += Number(l.fat); });
    return { kcal: Math.round(kcal), p: Math.round(p), c: Math.round(c), fat: Math.round(fat) };
  }, [logs]);

  const target = {
    kcal: plan?.target_kcal ?? 0,
    p: plan?.target_protein ?? 0,
    c: plan?.target_carbs ?? 0,
    fat: plan?.target_fat ?? 0,
  };

  const pct = (used: number, t: number) => t > 0 ? Math.min(100, Math.round((used / t) * 100)) : 0;

  return (
    <>
      <PhoneShell
        hasBottomNav
        eyebrow="Ishrana"
        title={
          <h1 className="font-display text-[30px] leading-[1.05] font-bold tracking-tightest">
            Tvoj <span className="text-gradient-brand">plan</span>
          </h1>
        }
      >
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !plan ? (
          <div className="text-center py-12">
            <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-brand-soft flex items-center justify-center mb-3">
              <Apple className="h-6 w-6 text-primary" strokeWidth={2} />
            </div>
            <h3 className="font-display text-lg font-bold mb-1">Nemaš plan ishrane</h3>
            <p className="text-sm text-muted-foreground px-8">
              Kontaktiraj svog trenera da ti dodeli plan.
            </p>
          </div>
        ) : (
          <div className="space-y-4 pb-24">
            {/* Today's totals card */}
            <div className="card-premium p-5 bg-gradient-brand text-white border-0 shadow-brand relative overflow-hidden">
              <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
              <div className="relative">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80 mb-1">Danas</div>
                <div className="font-display text-[28px] font-bold tracking-tighter leading-tight">
                  {consumed.kcal} <span className="text-white/70 text-lg">/ {target.kcal} kcal</span>
                </div>
                <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-white rounded-full transition-all" style={{ width: `${pct(consumed.kcal, target.kcal)}%` }} />
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4 text-center">
                  <div>
                    <div className="text-xs text-white/70">Proteini</div>
                    <div className="font-bold">{consumed.p}<span className="text-white/60 text-xs">/{target.p}g</span></div>
                  </div>
                  <div>
                    <div className="text-xs text-white/70">UH</div>
                    <div className="font-bold">{consumed.c}<span className="text-white/60 text-xs">/{target.c}g</span></div>
                  </div>
                  <div>
                    <div className="text-xs text-white/70">Masti</div>
                    <div className="font-bold">{consumed.fat}<span className="text-white/60 text-xs">/{target.fat}g</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Today's planned meals */}
            {day && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Današnji obroci</div>
                    <div className="font-display text-lg font-bold">{day.name}</div>
                  </div>
                </div>
                <div className="space-y-2">
                  {meals.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nema obroka za danas</p>
                  )}
                  {meals.map((m) => {
                    const items = itemsByMeal[m.id] ?? [];
                    let mKcal = 0;
                    items.forEach((it) => { mKcal += macros(it).kcal; });
                    return (
                      <div key={m.id} className="card-premium p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <div className="font-semibold text-sm">{m.name} {m.time_hint && <span className="text-muted-foreground font-normal">· {m.time_hint}</span>}</div>
                            <div className="text-[11px] text-muted-foreground">{Math.round(mKcal)} kcal</div>
                          </div>
                          <button
                            onClick={() => openLog(m.name)}
                            className="h-8 px-3 rounded-full bg-primary-soft text-primary-soft-foreground text-xs font-semibold flex items-center gap-1"
                          >
                            <Plus className="h-3 w-3" /> Loguj
                          </button>
                        </div>
                        {items.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Nema namirnica</p>
                        ) : (
                          <ul className="space-y-1">
                            {items.map((it) => {
                              const x = macros(it);
                              return (
                                <li key={it.id} className="flex items-center justify-between text-xs py-1 border-t border-hairline first:border-t-0">
                                  <span className="font-medium truncate flex-1">{it.food_items?.name}</span>
                                  <span className="text-muted-foreground ml-2">{it.grams}g · {x.kcal} kcal</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Today's logs */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Šta sam pojeo</div>
                  <div className="font-display text-lg font-bold">Današnji log</div>
                </div>
                <button
                  onClick={() => openLog()}
                  className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-brand active:scale-95 transition"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>
              {logs.length === 0 ? (
                <div className="card-premium p-6 text-center">
                  <Flame className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Još nisi ništa logovao danas</p>
                </div>
              ) : (
                <div className="card-premium divide-y divide-hairline">
                  {logs.map((l) => (
                    <div key={l.id} className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">
                          {l.food_items?.name ?? l.custom_food_name ?? "Namirnica"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {l.meal_name && <>{l.meal_name} · </>}{l.grams}g · {Math.round(l.kcal)} kcal · P{Math.round(l.protein)}
                        </div>
                      </div>
                      <button
                        onClick={() => removeLog(l.id)}
                        className="h-7 w-7 rounded-md hover:bg-destructive-soft flex items-center justify-center"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* Log dialog */}
        <Dialog open={logOpen} onOpenChange={setLogOpen}>
          <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{pickedFood ? "Količina" : "Loguj namirnicu"}</DialogTitle>
            </DialogHeader>

            {!pickedFood ? (
              <>
                {pickedMealName && (
                  <div className="text-xs text-muted-foreground -mt-2">Za obrok: <span className="font-semibold text-foreground">{pickedMealName}</span></div>
                )}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={foodQuery}
                    onChange={(e) => setFoodQuery(e.target.value)}
                    placeholder="Pretraži namirnicu..."
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <div className="overflow-y-auto flex-1 space-y-1 -mx-1 px-1">
                  {filteredFoods.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setPickedFood(f)}
                      className="w-full text-left p-3 rounded-lg hover:bg-surface-2 flex items-center gap-3 transition"
                    >
                      <div className="h-9 w-9 rounded-lg bg-gradient-brand-soft flex items-center justify-center shrink-0">
                        <Apple className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{f.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {f.kcal_per_100g} kcal · P{f.protein_per_100g} U{f.carbs_per_100g} M{f.fat_per_100g} /100g
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="bg-surface-2 rounded-xl p-3">
                  <div className="font-semibold text-sm">{pickedFood.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {pickedFood.kcal_per_100g} kcal · P{pickedFood.protein_per_100g} /100g
                  </div>
                </div>
                <div>
                  <Label htmlFor="lgrams">Količina (g)</Label>
                  <Input id="lgrams" type="number" value={pickedGrams} onChange={(e) => setPickedGrams(e.target.value)} className="mt-1.5" autoFocus />
                </div>
                {pickedGrams && parseFloat(pickedGrams) > 0 && (
                  <div className="text-center bg-gradient-brand-soft rounded-xl p-3">
                    <div className="font-bold text-lg text-primary">
                      {Math.round(pickedFood.kcal_per_100g * parseFloat(pickedGrams) / 100)} kcal
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setPickedFood(null)} className="flex-1">Nazad</Button>
                  <Button onClick={addLog} className="flex-1">Loguj</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </PhoneShell>
      <BottomNav role="athlete" />
    </>
  );
};

export default Nutrition;
