import { useEffect, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Plus, Pencil, Trash2, Package } from "lucide-react";
import { toast } from "sonner";

type Pkg = {
  id: string;
  name: string;
  sessions_count: number;
  duration_days: number;
  price_rsd: number;
  is_active: boolean;
};

const PACKAGE_LIMIT = 20;
const empty = { name: "", sessions_count: "12", duration_days: "28", price_rsd: "12000" };

const Packages = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Pkg | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("membership_packages")
      .select("*")
      .eq("trainer_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setPackages((data as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const activeCount = packages.filter((p) => p.is_active).length;

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (p: Pkg) => {
    setEditing(p);
    setForm({
      name: p.name,
      sessions_count: String(p.sessions_count),
      duration_days: String(p.duration_days),
      price_rsd: String(p.price_rsd),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    const name = form.name.trim();
    const sc = parseInt(form.sessions_count, 10);
    const dd = parseInt(form.duration_days, 10);
    const pr = parseInt(form.price_rsd, 10);

    if (!name) return toast.error("Naziv je obavezan");
    if (!sc || sc < 1 || sc > 200) return toast.error("Broj treninga 1–200");
    if (!dd || dd < 1 || dd > 365) return toast.error("Trajanje 1–365 dana");
    if (isNaN(pr) || pr < 0) return toast.error("Cena mora biti broj");

    setSaving(true);
    const payload = {
      trainer_id: user.id,
      name, sessions_count: sc, duration_days: dd, price_rsd: pr, is_active: true,
    };
    const { error } = editing
      ? await supabase.from("membership_packages").update(payload).eq("id", editing.id)
      : await supabase.from("membership_packages").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Sačuvano" : "Paket dodat");
    setOpen(false);
    load();
  };

  const toggleActive = async (p: Pkg) => {
    const { error } = await supabase
      .from("membership_packages")
      .update({ is_active: !p.is_active })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (p: Pkg) => {
    if (!confirm(`Obriši paket "${p.name}"?`)) return;
    const { error } = await supabase.from("membership_packages").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Paket obrisan");
    load();
  };

  return (
    <>
      <PhoneShell
        hasBottomNav
        back="/trener"
        eyebrow="Naplata"
        title={
          <h1 className="font-display text-[28px] leading-[1.05] font-bold tracking-tightest">
            Paketi članarina
          </h1>
        }
      >
        <div className="flex items-center justify-between">
          <p className="text-[12.5px] text-muted-foreground">
            {activeCount} / {PACKAGE_LIMIT} aktivnih
          </p>
          <Button
            onClick={openNew}
            disabled={activeCount >= PACKAGE_LIMIT}
            size="sm"
            className="bg-gradient-brand text-white shadow-brand"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Novi paket
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : packages.length === 0 ? (
          <Card className="p-6 text-center space-y-3">
            <div className="h-12 w-12 mx-auto rounded-2xl bg-muted flex items-center justify-center">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="font-display text-[18px] font-bold tracking-tight">
              Još nemaš paketa
            </div>
            <p className="text-[13px] text-muted-foreground">
              Dodaj paket da vežbači mogu da kupe članarinu.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {packages.map((p) => (
              <Card key={p.id} className={p.is_active ? "p-4" : "p-4 opacity-60"}>
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 rounded-2xl bg-gradient-brand-soft text-primary flex items-center justify-center shrink-0">
                    <Package className="h-[18px] w-[18px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-semibold tracking-tight truncate">
                      {p.name}
                    </div>
                    <div className="text-[12.5px] text-muted-foreground">
                      {p.sessions_count} treninga · {p.duration_days} dana
                    </div>
                    <div className="font-display text-[18px] font-bold tracking-tight text-primary mt-1 tnum">
                      {p.price_rsd.toLocaleString("sr-RS")} RSD
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(p)}
                        className="h-8 w-8 rounded-lg bg-surface-2 flex items-center justify-center hover:bg-muted"
                        aria-label="Izmeni"
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => remove(p)}
                        className="h-8 w-8 rounded-lg bg-surface-2 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Obriši"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </PhoneShell>
      <BottomNav role="trainer" />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Izmeni paket" : "Novi paket"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pname">Naziv</Label>
              <Input
                id="pname"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="npr. 12 treninga / 4 nedelje"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="psc">Treninga</Label>
                <Input
                  id="psc"
                  type="number"
                  min={1}
                  max={200}
                  value={form.sessions_count}
                  onChange={(e) => setForm({ ...form, sessions_count: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pdd">Trajanje (dani)</Label>
                <Input
                  id="pdd"
                  type="number"
                  min={1}
                  max={365}
                  value={form.duration_days}
                  onChange={(e) => setForm({ ...form, duration_days: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ppr">Cena (RSD)</Label>
              <Input
                id="ppr"
                type="number"
                min={0}
                value={form.price_rsd}
                onChange={(e) => setForm({ ...form, price_rsd: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Otkaži</Button>
            <Button
              onClick={save}
              disabled={saving}
              className="bg-gradient-brand text-white shadow-brand"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sačuvaj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Packages;
