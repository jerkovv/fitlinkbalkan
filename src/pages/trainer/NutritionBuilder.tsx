import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { PhoneShell } from "@/components/PhoneShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, Loader2, Apple, Search, Trash2, ChevronDown, ChevronUp, UserPlus, Check, CalendarDays,
} from "lucide-react";
import { toast } from "sonner";

type Day = { id: string; day_number: number; name: string };
type Meal = { id: string; day_id: string; meal_order: number; name: string; time_hint: string | null };
type Food = {
  id: string;
  name: string;
  category: string | null;
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  serving_size_g: number | null;
  is_vegan: boolean | null;
  is_gluten_free: boolean | null;
  is_posno: boolean | null;
};
type MealItem = {
  id: string; meal_id: string; food_id: string; grams: number; item_order: number;
  food_items: Food | null;
};
type Athlete = { id: string; full_name: string | null; email: string };
type Schedule = { weekday: number; day_id: string | null };

const WEEKDAYS = ["Ned", "Pon", "Uto", "Sre", "Čet", "Pet", "Sub"];

const macros = (item: MealItem) => {
  const f = item.food_items;
  if (!f) return { kcal: 0, p: 0, c: 0, fat: 0 };
  const r = item.grams / 100;
  return {
    kcal: Math.round(f.kcal_per_100g * r),
    p: Math.round(f.protein_per_100g * r * 10) / 10,
    c: Math.round(f.carbs_per_100g * r * 10) / 10,
    fat: Math.round(f.fat_per_100g * r * 10) / 10,
  };
};

const NutritionBuilder = () => {
  const { id: templateId } = useParams<{ id: string }>();
  const [templateName, setTemplateName] = useState("");
  const [days, setDays] = useState<Day[]>([]);
  const [mealsByDay, setMealsByDay] = useState<Record<string, Meal[]>>({});
  const [itemsByMeal, setItemsByMeal] = useState<Record<string, MealItem[]>>({});
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Add day
  const [addDayOpen, setAddDayOpen] = useState(false);
  const [newDayName, setNewDayName] = useState("");

  // Add meal
  const [addMealForDayId, setAddMealForDayId] = useState<string | null>(null);
  const [newMealName, setNewMealName] = useState("");
  const [newMealTime, setNewMealTime] = useState("");

  // Food picker
  const [pickerMealId, setPickerMealId] = useState<string | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [foodQuery, setFoodQuery] = useState("");
  const [pickedFood, setPickedFood] = useState<Food | null>(null);
  const [pickedGrams, setPickedGrams] = useState("100");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [filterVegan, setFilterVegan] = useState(false);
  const [filterGlutenFree, setFilterGlutenFree] = useState(false);
  const [filterPosno, setFilterPosno] = useState(false);

  // Schedule
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedule, setSchedule] = useState<Schedule[]>(WEEKDAYS.map((_, i) => ({ weekday: i, day_id: null })));

  // Assign
  const [assignOpen, setAssignOpen] = useState(false);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);

  const load = async () => {
    if (!templateId) return;
    setLoading(true);
    const [{ data: tpl }, { data: daysData }, { data: schedData }] = await Promise.all([
      supabase.from("nutrition_plan_templates").select("name").eq("id", templateId).maybeSingle(),
      supabase.from("nutrition_plan_days").select("*").eq("template_id", templateId).order("day_number"),
      supabase.from("nutrition_plan_week_schedule").select("weekday, day_id").eq("template_id", templateId),
    ]);
    setTemplateName((tpl as any)?.name ?? "Plan");
    const dList = (daysData as any) ?? [];
    setDays(dList);

    // Schedule merge
    const sched = WEEKDAYS.map((_, i) => {
      const f = (schedData as any)?.find((s: any) => s.weekday === i);
      return { weekday: i, day_id: f?.day_id ?? null };
    });
    setSchedule(sched);

    if (dList.length) {
      const dayIds = dList.map((d: any) => d.id);
      const { data: meals } = await supabase
        .from("nutrition_plan_meals")
        .select("*")
        .in("day_id", dayIds)
        .order("meal_order");
      const mealsGrouped: Record<string, Meal[]> = {};
      (meals ?? []).forEach((m: any) => {
        mealsGrouped[m.day_id] = mealsGrouped[m.day_id] ?? [];
        mealsGrouped[m.day_id].push(m);
      });
      setMealsByDay(mealsGrouped);

      const mealIds = (meals ?? []).map((m: any) => m.id);
      if (mealIds.length) {
        const { data: items } = await supabase
          .from("nutrition_plan_meal_items")
          .select("*, food_items(*)")
          .in("meal_id", mealIds)
          .order("item_order");
        const itemsGrouped: Record<string, MealItem[]> = {};
        (items ?? []).forEach((it: any) => {
          itemsGrouped[it.meal_id] = itemsGrouped[it.meal_id] ?? [];
          itemsGrouped[it.meal_id].push(it);
        });
        setItemsByMeal(itemsGrouped);
      }

      if (!openDay) setOpenDay(dList[0].id);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [templateId]);

  const loadFoods = async () => {
    const { data } = await supabase
      .from("food_items")
      .select("id, name, category, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, serving_size_g, is_vegan, is_gluten_free, is_posno")
      .eq("za_trenera", true)
      .order("name");
    setFoods((data as any) ?? []);
  };

  // Kategorije izvučene iz učitanih namirnica
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    foods.forEach((f) => { if (f.category) set.add(f.category); });
    return Array.from(set).sort();
  }, [foods]);

  const handleAddDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateId) return;
    const nextNum = (days[days.length - 1]?.day_number ?? 0) + 1;
    const { error } = await supabase.from("nutrition_plan_days").insert({
      template_id: templateId,
      day_number: nextNum,
      name: newDayName || `Dan ${nextNum}`,
    } as any);
    if (error) { toast.error(error.message); return; }
    setAddDayOpen(false); setNewDayName("");
    toast.success("Dan dodat");
    load();
  };

  const handleDeleteDay = async (dayId: string) => {
    if (!confirm("Obrisati dan i sve obroke?")) return;
    const { error } = await supabase.from("nutrition_plan_days").delete().eq("id", dayId);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const handleAddMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addMealForDayId) return;
    const currMeals = mealsByDay[addMealForDayId] ?? [];
    const { error } = await supabase.from("nutrition_plan_meals").insert({
      day_id: addMealForDayId,
      meal_order: currMeals.length + 1,
      name: newMealName || "Obrok",
      time_hint: newMealTime || null,
    } as any);
    if (error) { toast.error(error.message); return; }
    setAddMealForDayId(null); setNewMealName(""); setNewMealTime("");
    load();
  };

  const handleDeleteMeal = async (mealId: string) => {
    if (!confirm("Obrisati obrok?")) return;
    await supabase.from("nutrition_plan_meals").delete().eq("id", mealId);
    load();
  };

  const openFoodPicker = async (mealId: string) => {
    setPickerMealId(mealId);
    setPickedFood(null);
    setPickedGrams("100");
    setFoodQuery("");
    setActiveCategory(null);
    setFilterVegan(false);
    setFilterGlutenFree(false);
    setFilterPosno(false);
    if (foods.length === 0) await loadFoods();
  };

  const selectFood = (f: Food) => {
    setPickedFood(f);
    setPickedGrams(String(f.serving_size_g ?? 100));
  };

  const addFoodToMeal = async () => {
    if (!pickerMealId || !pickedFood) return;
    const grams = parseFloat(pickedGrams);
    if (!grams || grams <= 0) { toast.error("Unesi gramažu"); return; }
    const curr = itemsByMeal[pickerMealId] ?? [];
    const { error } = await supabase.from("nutrition_plan_meal_items").insert({
      meal_id: pickerMealId,
      food_id: pickedFood.id,
      grams,
      item_order: curr.length + 1,
    } as any);
    if (error) { toast.error(error.message); return; }
    setPickerMealId(null);
    load();
  };

  const removeItem = async (itemId: string) => {
    await supabase.from("nutrition_plan_meal_items").delete().eq("id", itemId);
    load();
  };

  const updateItemGrams = async (itemId: string, grams: number) => {
    await supabase.from("nutrition_plan_meal_items").update({ grams } as any).eq("id", itemId);
    load();
  };

  const dayTotals = (dayId: string) => {
    const meals = mealsByDay[dayId] ?? [];
    let kcal = 0, p = 0, c = 0, fat = 0;
    meals.forEach((m) => {
      (itemsByMeal[m.id] ?? []).forEach((it) => {
        const x = macros(it);
        kcal += x.kcal; p += x.p; c += x.c; fat += x.fat;
      });
    });
    return { kcal: Math.round(kcal), p: Math.round(p), c: Math.round(c), fat: Math.round(fat) };
  };

  const filteredFoods = useMemo(() => {
    const q = foodQuery.trim().toLowerCase();
    return foods.filter((f) => {
      if (activeCategory && f.category !== activeCategory) return false;
      if (filterVegan && !f.is_vegan) return false;
      if (filterGlutenFree && !f.is_gluten_free) return false;
      if (filterPosno && !f.is_posno) return false;
      if (q && !f.name.toLowerCase().includes(q) && !(f.category ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [foods, foodQuery, activeCategory, filterVegan, filterGlutenFree, filterPosno]);

  const setScheduleDay = async (weekday: number, dayId: string | null) => {
    if (!templateId) return;
    setSchedule((prev) => prev.map((s) => s.weekday === weekday ? { ...s, day_id: dayId } : s));
    // Upsert
    const { data: existing } = await supabase
      .from("nutrition_plan_week_schedule")
      .select("id")
      .eq("template_id", templateId)
      .eq("weekday", weekday)
      .maybeSingle();
    if (existing) {
      await supabase.from("nutrition_plan_week_schedule").update({ day_id: dayId } as any).eq("id", (existing as any).id);
    } else {
      await supabase.from("nutrition_plan_week_schedule").insert({ template_id: templateId, weekday, day_id: dayId } as any);
    }
  };

  const openAssign = async () => {
    setAssignOpen(true);
    if (athletes.length === 0) {
      const { data, error } = await supabase.rpc("get_my_athletes" as any);
      if (error) {
        console.error("get_my_athletes error:", error);
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
            .select("id, full_name, email")
            .in("id", ids);
          const pMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
          setAthletes(ids.map((id) => {
            const p = pMap.get(id) as any;
            return { id, full_name: p?.full_name ?? null, email: p?.email ?? "" };
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
    const { error } = await supabase.rpc("assign_nutrition_plan_to_athlete", {
      p_template_id: templateId,
      p_athlete_id: athleteId,
    });
    setAssigning(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Plan ishrane dodeljen");
    setAssignOpen(false);
  };

  return (
    <PhoneShell
      back="/trener/ishrana"
      eyebrow="Plan ishrane"
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
            <Apple className="h-6 w-6 text-primary" strokeWidth={2} />
          </div>
          <h3 className="font-display text-lg font-bold mb-1">Dodaj prvi dan</h3>
          <p className="text-sm text-muted-foreground mb-4 px-8">
            Plan ima dane (Dan 1, Dan 2…). U nedeljnom rasporedu biraš koji dan ide kog dana.
          </p>
          <Button onClick={() => setAddDayOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Novi dan
          </Button>
        </div>
      ) : (
        <div className="space-y-3 pb-32">
          {/* Week schedule button */}
          <button
            onClick={() => setScheduleOpen(true)}
            className="w-full card-premium-hover p-4 flex items-center gap-3"
          >
            <div className="h-10 w-10 rounded-xl bg-gradient-brand-soft flex items-center justify-center shrink-0">
              <CalendarDays className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-sm">Nedeljni raspored</div>
              <div className="text-[11px] text-muted-foreground">
                {schedule.filter((s) => s.day_id).length}/7 dana podešeno
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>

          {days.map((d) => {
            const meals = mealsByDay[d.id] ?? [];
            const isOpen = openDay === d.id;
            const tot = dayTotals(d.id);
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
                      {tot.kcal} kcal · P{tot.p} U{tot.c} M{tot.fat} · {meals.length} {meals.length === 1 ? "obrok" : "obroka"}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>

                {isOpen && (
                  <div className="border-t border-hairline px-4 py-3 space-y-3 bg-surface-2/50">
                    {meals.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">Nema obroka u ovom danu</p>
                    )}
                    {meals.map((m) => {
                      const items = itemsByMeal[m.id] ?? [];
                      let mKcal = 0, mP = 0;
                      items.forEach((it) => { const x = macros(it); mKcal += x.kcal; mP += x.p; });
                      return (
                        <div key={m.id} className="bg-surface rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm truncate">
                                {m.name} {m.time_hint && <span className="text-muted-foreground font-normal">· {m.time_hint}</span>}
                              </div>
                              <div className="text-[11px] text-muted-foreground">{Math.round(mKcal)} kcal · P{Math.round(mP)}g</div>
                            </div>
                            <button
                              onClick={() => handleDeleteMeal(m.id)}
                              className="h-7 w-7 rounded-md hover:bg-destructive-soft flex items-center justify-center transition"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </button>
                          </div>

                          {items.map((it) => {
                            const x = macros(it);
                            return (
                              <div key={it.id} className="flex items-center gap-2 py-1.5 border-t border-hairline first:border-t-0">
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-semibold truncate">{it.food_items?.name ?? "—"}</div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {x.kcal} kcal · P{x.p} U{x.c} M{x.fat}
                                  </div>
                                </div>
                                <Input
                                  type="number"
                                  defaultValue={it.grams}
                                  onBlur={(e) => {
                                    const v = parseFloat(e.target.value);
                                    if (v && v !== it.grams) updateItemGrams(it.id, v);
                                  }}
                                  className="h-7 w-16 text-xs text-right"
                                />
                                <span className="text-[10px] text-muted-foreground w-3">g</span>
                                <button
                                  onClick={() => removeItem(it.id)}
                                  className="h-6 w-6 rounded-md hover:bg-destructive-soft flex items-center justify-center"
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </button>
                              </div>
                            );
                          })}

                          <button
                            onClick={() => openFoodPicker(m.id)}
                            className="w-full py-2 rounded-md border border-dashed border-hairline text-xs text-muted-foreground hover:border-primary hover:text-primary transition flex items-center justify-center gap-1"
                          >
                            <Plus className="h-3 w-3" /> Dodaj namirnicu
                          </button>
                        </div>
                      );
                    })}

                    <button
                      onClick={() => setAddMealForDayId(d.id)}
                      className="w-full py-2.5 rounded-lg border-2 border-dashed border-hairline text-sm text-muted-foreground hover:border-primary hover:text-primary transition flex items-center justify-center gap-1.5"
                    >
                      <Plus className="h-4 w-4" /> Dodaj obrok
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

      {/* Add Day */}
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
                placeholder={`Dan ${(days[days.length - 1]?.day_number ?? 0) + 1} — Trening dan`}
                className="mt-1.5"
                autoFocus
              />
            </div>
            <DialogFooter><Button type="submit" className="w-full">Dodaj dan</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Meal */}
      <Dialog open={!!addMealForDayId} onOpenChange={(o) => !o && setAddMealForDayId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novi obrok</DialogTitle></DialogHeader>
          <form onSubmit={handleAddMeal} className="space-y-3">
            <div>
              <Label htmlFor="meal-name">Naziv obroka</Label>
              <Input id="meal-name" value={newMealName} onChange={(e) => setNewMealName(e.target.value)} placeholder="Doručak" className="mt-1.5" autoFocus />
            </div>
            <div>
              <Label htmlFor="meal-time">Vreme (opciono)</Label>
              <Input id="meal-time" value={newMealTime} onChange={(e) => setNewMealTime(e.target.value)} placeholder="08:00" className="mt-1.5" />
            </div>
            <DialogFooter><Button type="submit" className="w-full">Dodaj obrok</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Food Picker */}
      <Dialog open={!!pickerMealId} onOpenChange={(o) => !o && setPickerMealId(null)}>
        <DialogContent className="max-w-md max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-hairline shrink-0">
            <DialogTitle>{pickedFood ? "Količina" : "Izaberi namirnicu"}</DialogTitle>
          </DialogHeader>

          {!pickedFood ? (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Sticky filter bar */}
              <div className="px-5 pt-4 pb-3 space-y-3 border-b border-hairline shrink-0 bg-surface">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={foodQuery}
                    onChange={(e) => setFoodQuery(e.target.value)}
                    placeholder="Pretraži namirnicu..."
                    className="pl-9 h-10"
                    autoFocus
                  />
                </div>

                {/* Dietary toggle filteri */}
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { key: "vegan", label: "Veganski", active: filterVegan, set: setFilterVegan },
                    { key: "gf", label: "Bez glutena", active: filterGlutenFree, set: setFilterGlutenFree },
                    { key: "posno", label: "Posno", active: filterPosno, set: setFilterPosno },
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => t.set(!t.active)}
                      className={`pill px-3 py-1.5 text-[11px] ${
                        t.active
                          ? "bg-primary text-primary-foreground shadow-brand"
                          : "bg-surface-2 text-muted-foreground hover:bg-surface-3"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Kategorije — horizontal scroll */}
                {availableCategories.length > 0 && (
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-5 px-5">
                    <button
                      onClick={() => setActiveCategory(null)}
                      className={`pill px-3 py-1.5 text-[11px] shrink-0 ${
                        activeCategory === null
                          ? "bg-foreground text-background"
                          : "bg-surface-2 text-muted-foreground hover:bg-surface-3"
                      }`}
                    >
                      Sve
                    </button>
                    {availableCategories.map((c) => (
                      <button
                        key={c}
                        onClick={() => setActiveCategory(c === activeCategory ? null : c)}
                        className={`pill px-3 py-1.5 text-[11px] shrink-0 ${
                          c === activeCategory
                            ? "bg-foreground text-background"
                            : "bg-surface-2 text-muted-foreground hover:bg-surface-3"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Counter + scrollable lista */}
              <div className="px-5 pt-2 pb-1 text-[10px] text-muted-foreground shrink-0">
                {filteredFoods.length} {filteredFoods.length === 1 ? "namirnica" : "namirnica"}
              </div>

              <div className="overflow-y-auto flex-1 min-h-0 px-3 pb-4 space-y-1">
                {filteredFoods.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    Nema namirnica za odabrane filtere
                  </p>
                ) : (
                  filteredFoods.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => selectFood(f)}
                      className="w-full text-left p-3 rounded-lg hover:bg-surface-2 flex items-center gap-3 transition"
                    >
                      <div className="h-9 w-9 rounded-lg bg-gradient-brand-soft flex items-center justify-center shrink-0">
                        <Apple className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-sm truncate">{f.name}</span>
                          {f.is_vegan && (
                            <span className="pill px-1.5 py-0 text-[9px] bg-success-soft text-success-soft-foreground">V</span>
                          )}
                          {f.is_gluten_free && (
                            <span className="pill px-1.5 py-0 text-[9px] bg-primary-soft text-primary-soft-foreground">GF</span>
                          )}
                          {f.is_posno && (
                            <span className="pill px-1.5 py-0 text-[9px] bg-warning-soft text-warning-soft-foreground">P</span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {f.category && <span>{f.category} · </span>}
                          {f.kcal_per_100g} kcal · P{f.protein_per_100g} U{f.carbs_per_100g} M{f.fat_per_100g} /100g
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="px-5 pb-5 pt-4 space-y-4 overflow-y-auto">
              <div className="bg-surface-2 rounded-xl p-3">
                <div className="font-semibold text-sm">{pickedFood.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {pickedFood.kcal_per_100g} kcal · P{pickedFood.protein_per_100g} U{pickedFood.carbs_per_100g} M{pickedFood.fat_per_100g} /100g
                </div>
              </div>

              <div>
                <Label htmlFor="grams">Količina (g)</Label>
                <Input
                  id="grams"
                  type="number"
                  value={pickedGrams}
                  onChange={(e) => setPickedGrams(e.target.value)}
                  className="mt-1.5"
                  autoFocus
                />
                {/* Brzi gram preseti */}
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {[50, 100, 150, 200].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setPickedGrams(String(g))}
                      className="pill px-2.5 py-1 text-[11px] bg-surface-2 hover:bg-surface-3 text-muted-foreground"
                    >
                      {g}g
                    </button>
                  ))}
                  {pickedFood.serving_size_g && (
                    <button
                      type="button"
                      onClick={() => setPickedGrams(String(pickedFood.serving_size_g))}
                      className="pill px-2.5 py-1 text-[11px] bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/80"
                    >
                      1 porcija ({pickedFood.serving_size_g}g)
                    </button>
                  )}
                </div>
              </div>

              {pickedGrams && parseFloat(pickedGrams) > 0 && (
                <div className="text-center text-sm bg-gradient-brand-soft rounded-xl p-3">
                  <div className="font-bold text-lg text-primary">
                    {Math.round(pickedFood.kcal_per_100g * parseFloat(pickedGrams) / 100)} kcal
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    P{Math.round(pickedFood.protein_per_100g * parseFloat(pickedGrams) / 10) / 10}g ·
                    U{Math.round(pickedFood.carbs_per_100g * parseFloat(pickedGrams) / 10) / 10}g ·
                    M{Math.round(pickedFood.fat_per_100g * parseFloat(pickedGrams) / 10) / 10}g
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPickedFood(null)} className="flex-1">Nazad</Button>
                <Button onClick={addFoodToMeal} className="flex-1">Dodaj</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Schedule */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nedeljni raspored</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">Za svaki dan u nedelji izaberi koji dan plana se primenjuje.</p>
          <div className="space-y-2">
            {schedule.map((s) => (
              <div key={s.weekday} className="flex items-center gap-2">
                <div className="w-12 text-sm font-semibold">{WEEKDAYS[s.weekday]}</div>
                <select
                  value={s.day_id ?? ""}
                  onChange={(e) => setScheduleDay(s.weekday, e.target.value || null)}
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— bez plana —</option>
                  {days.map((d) => (
                    <option key={d.id} value={d.id}>Dan {d.day_number} · {d.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setScheduleOpen(false)} className="w-full">Gotovo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign */}
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

      {/* Sticky CTA */}
      {days.length > 0 && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[440px] px-6 pb-6 pt-3 bg-gradient-to-t from-background via-background to-transparent">
          <Button onClick={openAssign} className="w-full shadow-brand">
            <UserPlus className="h-4 w-4 mr-2" /> Dodeli vežbaču
          </Button>
        </div>
      )}
    </PhoneShell>
  );
};

export default NutritionBuilder;
