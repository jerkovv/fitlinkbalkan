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
import { Plus, ClipboardList, ChevronRight, Loader2, Target } from "lucide-react";
import { toast } from "sonner";

type Template = {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;
  level: string | null;
  created_at: string;
};

const ProgramTemplates = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<Template[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("program_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setItems((data as any) ?? []);
      // count days per template
      const ids = (data ?? []).map((t: any) => t.id);
      if (ids.length) {
        const { data: days } = await supabase
          .from("program_template_days")
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
    const { error } = await supabase.from("program_templates").insert({
      trainer_id: user.id,
      name,
      description: description || null,
      goal: goal || null,
      level: level || null,
    } as any);
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Program kreiran");
    setOpen(false);
    setName(""); setDescription(""); setGoal(""); setLevel("");
    load();
  };

  return (
    <PhoneShell
      back="/trener"
      eyebrow="Treninzi"
      title="Programi"
      rightSlot={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-brand active:scale-95 transition">
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Novi program</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Label htmlFor="p-name">Naziv programa</Label>
                <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="npr. Push Pull Legs" className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="p-desc">Opis (opciono)</Label>
                <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1.5" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="p-goal">Cilj</Label>
                  <Input id="p-goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Hipertrofija" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="p-level">Nivo</Label>
                  <Input id="p-level" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Srednji" className="mt-1.5" />
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Kreiraj program
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
            <ClipboardList className="h-6 w-6 text-primary" strokeWidth={2} />
          </div>
          <h3 className="font-display text-lg font-bold mb-1">Nemaš programa</h3>
          <p className="text-sm text-muted-foreground mb-4 px-8">
            Kreiraj prvi program i dodeli ga svojim vežbačima.
          </p>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Novi program
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            <Link
              key={t.id}
              to={`/trener/programi/${t.id}`}
              className="card-premium-hover flex items-center gap-3 p-4"
            >
              <div className="h-12 w-12 rounded-xl bg-gradient-brand-soft flex items-center justify-center shrink-0">
                <ClipboardList className="h-5 w-5 text-primary" strokeWidth={2.25} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px] truncate">{t.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <span>{counts[t.id] ?? 0} {(counts[t.id] ?? 0) === 1 ? "dan" : "dana"}</span>
                  {t.goal && (<><span className="opacity-50">•</span><span>{t.goal}</span></>)}
                  {t.level && (<><span className="opacity-50">•</span><span>{t.level}</span></>)}
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

export default ProgramTemplates;
