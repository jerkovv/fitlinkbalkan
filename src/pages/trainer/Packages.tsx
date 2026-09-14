import { useEffect, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  FullScreenSheet,
  FullScreenSheetScroll,
  FullScreenSheetFooter,
} from "@/components/ui/full-screen-sheet";
import { supabase } from "@/lib/supabase";
import { porukaGreske } from "@/lib/errorMessage";
import { useConfirm } from "@/hooks/useConfirm";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Plus, Pencil, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { LockMark } from "@/components/pretplata/LockMark";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { cn } from "@/lib/utils";

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
  const { locked, openLock } = usePretplataLock();
  const { user } = useAuth();
  const confirm = useConfirm();
  const desktop = useDesktopWeb();
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
    if (error) toast.error(porukaGreske(error));
    setPackages((data as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const activeCount = packages.filter((p) => p.is_active).length;

  const openNew = () => {
    if (locked) return openLock();
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (p: Pkg) => {
    if (locked) return openLock();
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
    if (locked) return openLock();
    if (!user) return;
    const name = form.name.trim();
    const sc = parseInt(form.sessions_count, 10);
    const dd = parseInt(form.duration_days, 10);
    const pr = parseInt(form.price_rsd, 10);

    if (!name) return toast.error("Naziv je obavezan");
    if (!sc || sc < 1 || sc > 200) return toast.error("Broj treninga 1-200");
    if (!dd || dd < 1 || dd > 365) return toast.error("Trajanje 1-365 dana");
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
    if (error) return toast.error(porukaGreske(error));
    toast.success(editing ? "Sačuvano" : "Paket dodat");
    setOpen(false);
    load();
  };

  const toggleActive = async (p: Pkg) => {
    if (locked) return openLock();
    const { error } = await supabase
      .from("membership_packages")
      .update({ is_active: !p.is_active })
      .eq("id", p.id);
    if (error) return toast.error(porukaGreske(error));
    load();
  };

  const remove = async (p: Pkg) => {
    if (locked) return openLock();
    if (!(await confirm({ title: `Obriši paket "${p.name}"?`, destructive: true }))) return;
    const { error } = await supabase.from("membership_packages").delete().eq("id", p.id);
    if (error) return toast.error(porukaGreske(error));
    toast.success("Paket obrisan");
    load();
  };

  return (
    <>
      <PhoneShell
        hasBottomNav
        back="/trener"
        eyebrow="Naplata"
        desktopWidth="wide"
        title={
          desktop ? (
            "Paketi članarina"
          ) : (
            <h1 className="font-display text-[28px] leading-[1.05] font-bold tracking-tightest">
              Paketi članarina
            </h1>
          )
        }
        // Racunar: brojac i dugme u zaglavlju, u visini naslova, umesto zasebnog
        // reda iznad liste.
        action={
          desktop ? (
            <>
              <span className="text-[12.5px] font-semibold text-muted-foreground tnum">
                {activeCount} / {PACKAGE_LIMIT} aktivnih
              </span>
              <Button
                onClick={openNew}
                disabled={activeCount >= PACKAGE_LIMIT}
                className="h-10 rounded-full px-4 bg-gradient-brand text-white shadow-brand"
              >
                <LockMark className="mr-1.5" />
                <Plus className="h-4 w-4 mr-1.5" strokeWidth={2.5} />
                Novi paket
              </Button>
            </>
          ) : undefined
        }
      >
        {!desktop && (
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
            <LockMark className="mr-1.5" /><Plus className="h-4 w-4 mr-1.5" /> Novi paket
          </Button>
        </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : packages.length === 0 ? (
          <Card className={cn("p-6 text-center space-y-3", desktop && "py-14")}>
            <div className="h-12 w-12 mx-auto rounded-2xl bg-muted flex items-center justify-center">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="font-display text-[18px] font-bold tracking-tight">
              Još nemaš paketa
            </div>
            <p className="text-[13px] text-muted-foreground">
              Dodaj paket da vežbači mogu da kupe članarinu.
            </p>
            {desktop && (
              <Button
                onClick={openNew}
                className="h-10 rounded-full px-4 bg-gradient-brand text-white shadow-brand"
              >
                <LockMark className="mr-1.5" />
                <Plus className="h-4 w-4 mr-1.5" strokeWidth={2.5} />
                Novi paket
              </Button>
            )}
          </Card>
        ) : desktop ? (
          // Racunar: mreza kartica. Tanke trake preko cele sirine su izgledale
          // izduzeno; kartica drzi cenu, sadrzaj paketa i kontrole zajedno.
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            {packages.map((p) => (
              <div key={p.id} className="group card-premium-hover flex min-h-[208px] flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={cn(
                      "h-11 w-11 rounded-xl bg-gradient-brand-soft flex items-center justify-center transition",
                      !p.is_active && "opacity-60",
                    )}
                  >
                    <Package className="h-5 w-5 text-primary" strokeWidth={2.25} />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2">
                    <span className="text-[11.5px] font-semibold text-muted-foreground">
                      {p.is_active ? "Aktivan" : "Neaktivan"}
                    </span>
                    <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                  </label>
                </div>

                {/* Neaktivan paket bledi samo sadrzajem; prekidac i dugmad ostaju jasni. */}
                <div className={cn("transition", !p.is_active && "opacity-60")}>
                  <div className="mt-4 font-display text-[17px] font-bold leading-snug tracking-tight line-clamp-2">
                    {p.name}
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="font-display text-[26px] font-bold leading-none tracking-tightest text-primary tnum">
                      {p.price_rsd.toLocaleString("sr-Latn-RS")}
                    </span>
                    <span className="text-[12px] font-semibold text-muted-foreground">RSD</span>
                  </div>
                  {p.sessions_count > 0 && (
                    <div className="mt-1 text-[12px] text-muted-foreground tnum">
                      {Math.round(p.price_rsd / p.sessions_count).toLocaleString("sr-Latn-RS")} RSD po treningu
                    </div>
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                  <div className={cn("flex flex-wrap items-center gap-1.5", !p.is_active && "opacity-60")}>
                    <span className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-1 text-[11.5px] font-semibold text-primary tnum">
                      {p.sessions_count} treninga
                    </span>
                    <span className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground tnum">
                      {p.duration_days} dana
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => openEdit(p)}
                      aria-label="Izmeni"
                      className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(p)}
                      aria-label="Obriši"
                      className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground transition hover:bg-destructive-soft hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {activeCount < PACKAGE_LIMIT && (
              <button
                onClick={openNew}
                className="flex min-h-[208px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-hairline text-muted-foreground transition hover:border-primary hover:text-primary"
              >
                <Plus className="h-5 w-5" />
                <span className="text-sm font-semibold">Novi paket</span>
              </button>
            )}
          </div>
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
                      {p.price_rsd.toLocaleString("sr-Latn-RS")} RSD
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

      <FullScreenSheet
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Izmeni paket" : "Novi paket"}
      >
        <FullScreenSheetScroll className="pt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pname">Naziv</Label>
            <Input
              id="pname"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="npr. 12 treninga / 4 nedelje"
              className="h-14 text-base rounded-2xl"
              autoFocus
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
                className="h-14 text-base rounded-2xl"
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
                className="h-14 text-base rounded-2xl"
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
              className="h-14 text-base rounded-2xl"
            />
          </div>
        </FullScreenSheetScroll>
        <FullScreenSheetFooter>
          <Button
            onClick={save}
            disabled={saving}
            className="w-full bg-gradient-brand text-white shadow-brand"
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Sačuvaj
          </Button>
        </FullScreenSheetFooter>
      </FullScreenSheet>
    </>
  );
};

export default Packages;
