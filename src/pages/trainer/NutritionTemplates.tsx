import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { PhoneShell } from "@/components/PhoneShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Apple, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Template = {
  id: string;
  name: string;
  goal: string | null;
  target_kcal: number | null;
  target_protein: number | null;
  created_at: string;
};

const NutritionTemplates = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<Template[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [targetKcal, setTargetKcal] = useState("");
  const [targetProtein, setTargetProtein] = useState("");
  const [targetCarbs, setTargetCarbs] = useState("");
  const [targetFat, setTargetFat] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("nutrition_plan_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setItems((data as any) ?? []);
      const ids = (data ?? []).map((t: any) => t.id);
      if (ids.length) {
        const { data: days } = await supabase
          .from("nutrition_plan_days")
          .select("template_id")
          .in("template_id", ids);
        const c: Record<string, number> = {};
        (days ?? []).forEach((d: any) => { c[d.template_id] = (c[d.template_id] ?? 0) + 1; });
        setCounts(c);
      }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from("nutrition_plan_templates").insert({
      trainer_id: user.id,
      name,
      goal: goal || null,
      target_kcal: targetKcal ? parseInt(targetKcal) : null,
      target_protein: targetProtein ? parseInt(targetProtein) : null,
      target_carbs: targetCarbs ? parseInt(targetCarbs) : null,
      target_fat: targetFat ? parseInt(targetFat) : null,
      notes: notes || null,
    } as any);
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Plan kreiran");
    setOpen(false);
    setName(""); setGoal(""); setTargetKcal(""); setTargetProtein(""); setTargetCarbs(""); setTargetFat(""); setNotes("");
    load();
  };

  return (
    <PhoneShell
      back="/trener"
      eyebrow="Ishrana"
      title="Planovi ishrane"
      rightSlot={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-brand active:scale-95 transition">
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Novi plan ishrane</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Label htmlFor="n-name">Naziv plana</Label>
                <Input id="n-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="npr. Cut 2200 kcal" className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="n-goal">Cilj</Label>
                <Input id="n-goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Mršavljenje / Masa / Održavanje" className="mt-1.5" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="n-kcal">Target kcal</Label>
                  <Input id="n-kcal" type="number" value={targetKcal} onChange={(e) => setTargetKcal(e.target.value)} placeholder="2200" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="n-prot">Target proteini (g)</Label>
                  <Input id="n-prot" type="number" value={targetProtein} onChange={(e) => setTargetProtein(e.target.value)} placeholder="180" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="n-carbs">Target UH (g)</Label>
                  <Input id="n-carbs" type="number" value={targetCarbs} onChange={(e) => setTargetCarbs(e.target.value)} placeholder="220" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="n-fat">Target masti (g)</Label>
                  <Input id="n-fat" type="number" value={targetFat} onChange={(e) => setTargetFat(e.target.value)} placeholder="70" className="mt-1.5" />
                </div>
              </div>
              <div>
                <Label htmlFor="n-notes">Napomene (opciono)</Label>
                <Textarea id="n-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1.5" />
              </div>
              <DialogFooter className="mt-4">
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Kreiraj plan
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-brand-soft flex items-center justify-center mb-3">
            <Apple className="h-6 w-6 text-primary" strokeWidth={2} />
          </div>
          <h3 className="font-display text-lg font-bold mb-1">Nemaš planova ishrane</h3>
          <p className="text-sm text-muted-foreground mb-4 px-8">
            Napravi prvi plan i dodeli ga vežbačima.
          </p>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Novi plan
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            <Link
              key={t.id}
              to={`/trener/ishrana/${t.id}`}
              className="card-premium-hover flex items-center gap-3 p-4"
            >
              <div className="h-12 w-12 rounded-xl bg-gradient-brand-soft flex items-center justify-center shrink-0">
                <Apple className="h-5 w-5 text-primary" strokeWidth={2.25} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px] truncate">{t.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <span>{counts[t.id] ?? 0} {(counts[t.id] ?? 0) === 1 ? "dan" : "dana"}</span>
                  {t.target_kcal && (<><span className="opacity-50">•</span><span>{t.target_kcal} kcal</span></>)}
                  {t.goal && (<><span className="opacity-50">•</span><span>{t.goal}</span></>)}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </PhoneShell>
  );
};

export default NutritionTemplates;
