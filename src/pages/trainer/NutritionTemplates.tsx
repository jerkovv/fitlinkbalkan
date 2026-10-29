import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { porukaGreske } from "@/lib/errorMessage";
import { useAuth } from "@/hooks/useAuth";
import { PhoneShell } from "@/components/PhoneShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FullScreenSheet,
  FullScreenSheetScroll,
  FullScreenSheetFooter,
} from "@/components/ui/full-screen-sheet";
import { Plus, Apple, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { LockMark } from "@/components/pretplata/LockMark";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";

type Template = {
  id: string;
  name: string;
  goal: string | null;
  target_kcal: number | null;
  target_protein: number | null;
  target_carbs?: number | null;
  target_fat?: number | null;
  created_at: string;
};

const NutritionTemplates = () => {
  const { locked, openLock, guard } = usePretplataLock();
  const { user } = useAuth();
  const desktop = useDesktopWeb();
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
      toast.error(porukaGreske(error));
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
    if (locked) return openLock();
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
    if (error) { toast.error(porukaGreske(error)); return; }
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
      desktopWidth="wide"
      action={
        desktop ? (
          <Button
            onClick={guard(() => setOpen(true))}
            className="h-10 rounded-full px-4 bg-gradient-brand text-white shadow-brand"
          >
            <LockMark className="mr-1.5" />
            <Plus className="h-4 w-4 mr-1.5" strokeWidth={2.5} />
            Novi plan
          </Button>
        ) : (
          <button
            onClick={guard(() => setOpen(true))}
            className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-brand active:scale-95 transition"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
          </button>
        )
      }
    >
      <FullScreenSheet open={open} onClose={() => setOpen(false)} title="Novi plan ishrane">
        <form onSubmit={handleCreate} className="flex flex-1 min-h-0 flex-col">
          <FullScreenSheetScroll className="pt-5 space-y-3">
            <div>
              <Label htmlFor="n-name">Naziv plana</Label>
              <Input id="n-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="npr. Cut 2200 kcal" className="mt-1.5 h-14 text-base rounded-2xl" autoFocus />
            </div>
            <div>
              <Label htmlFor="n-goal">Cilj</Label>
              <Input id="n-goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Mršavljenje / Masa / Održavanje" className="mt-1.5 h-14 text-base rounded-2xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="n-kcal">Target kcal</Label>
                <Input id="n-kcal" type="number" value={targetKcal} onChange={(e) => setTargetKcal(e.target.value)} placeholder="2200" className="mt-1.5 h-14 text-base rounded-2xl" />
              </div>
              <div>
                <Label htmlFor="n-prot">Target proteini (g)</Label>
                <Input id="n-prot" type="number" value={targetProtein} onChange={(e) => setTargetProtein(e.target.value)} placeholder="180" className="mt-1.5 h-14 text-base rounded-2xl" />
              </div>
              <div>
                <Label htmlFor="n-carbs">Target UH (g)</Label>
                <Input id="n-carbs" type="number" value={targetCarbs} onChange={(e) => setTargetCarbs(e.target.value)} placeholder="220" className="mt-1.5 h-14 text-base rounded-2xl" />
              </div>
              <div>
                <Label htmlFor="n-fat">Target masti (g)</Label>
                <Input id="n-fat" type="number" value={targetFat} onChange={(e) => setTargetFat(e.target.value)} placeholder="70" className="mt-1.5 h-14 text-base rounded-2xl" />
              </div>
            </div>
            <div>
              <Label htmlFor="n-notes">Napomene (opciono)</Label>
              <Textarea id="n-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1.5" />
            </div>
          </FullScreenSheetScroll>
          <FullScreenSheetFooter>
            <Button type="submit" disabled={submitting} className="w-full bg-gradient-brand text-white shadow-brand">
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <LockMark className="mr-1.5" />Kreiraj plan
            </Button>
          </FullScreenSheetFooter>
        </form>
      </FullScreenSheet>
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
          <Button onClick={guard(() => setOpen(true))}>
            <LockMark className="mr-1.5" /><Plus className="h-4 w-4 mr-1.5" /> Novi plan
          </Button>
        </div>
      ) : desktop ? (
        // Racunar: najnoviji plan kao vrh sa krugom makroa (Ponoc), pa mreza kartica
        // kao kod programa; kartica drzi naziv i ciljeve plana zajedno.
        <div className="space-y-4">
        {items[0] && <VrhPlana t={items[0]} dana={counts[items[0].id] ?? 0} />}
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((t) => {
            const brojDana = counts[t.id] ?? 0;
            return (
              <Link
                key={t.id}
                to={`/trener/ishrana/${t.id}`}
                className="card-premium-hover flex min-h-[176px] flex-col p-5"
              >
                <div className="h-11 w-11 rounded-xl bg-gradient-brand-soft flex items-center justify-center">
                  <Apple className="h-5 w-5 text-primary" strokeWidth={2.25} />
                </div>
                <div className="mt-4 font-display text-[17px] font-bold leading-snug tracking-tight">
                  {t.name}
                </div>
                {t.target_kcal != null && (
                  <div className="mt-1 text-[13px] text-muted-foreground tnum">
                    {t.target_kcal} kcal
                    {t.target_protein != null && ` · ${t.target_protein} g proteina`}
                  </div>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
                  <span className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground tnum">
                    {brojDana} {brojDana === 1 ? "dan" : "dana"}
                  </span>
                  {t.goal && (
                    <span className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-1 text-[11.5px] font-semibold text-primary">
                      {t.goal}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
          <button
            onClick={guard(() => setOpen(true))}
            className="flex min-h-[176px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-hairline text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <Plus className="h-5 w-5" />
            <span className="text-sm font-semibold">Novi plan</span>
          </button>
        </div>
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

// ===== Vrh ekrana na racunaru (Ponoc) =====
// Najnoviji plan: naziv, ciljevi i krug makroa na staklu. Kalorije makroa se
// racunaju 4/4/9 kcal po gramu, pa krug pokazuje udeo u kalorijama, ne u gramima.
const MAKRO = [
  { kljuc: "target_protein", ime: "proteini", boja: "hsl(262 100% 82%)", kcal: 4 },
  { kljuc: "target_carbs", ime: "ugljeni hidrati", boja: "hsl(154 70% 55%)", kcal: 4 },
  { kljuc: "target_fat", ime: "masti", boja: "hsl(36 100% 64%)", kcal: 9 },
] as const;

const VrhPlana = ({ t, dana }: { t: Template; dana: number }) => {
  const delovi = MAKRO.map((m) => ({ ...m, g: (t[m.kljuc] as number | null | undefined) ?? 0 }));
  const ukupno = delovi.reduce((s2, d) => s2 + d.g * d.kcal, 0);
  const obim = 2 * Math.PI * 40;
  let pomak = 0;
  return (
    <section
      className="relative grid min-h-[220px] grid-cols-[minmax(0,1fr)_auto] items-center gap-6 overflow-hidden rounded-[28px] border border-hairline px-7 py-6"
      style={{ background: "linear-gradient(120deg, hsl(258 22% 9%) 30%, hsl(154 70% 55% / 0.08) 70%, hsl(267 81% 58% / 0.18))" }}
    >
      <div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
          Najnoviji plan · {dana} {dana === 1 ? "dan" : "dana"}
        </span>
        <h2 className="mt-1.5 font-display text-[32px] font-bold leading-[1.05] tracking-[-0.03em]">{t.name}</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {t.goal && <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary-soft-foreground">{t.goal}</span>}
          {t.target_kcal != null && <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{t.target_kcal} kcal dnevno</span>}
        </div>
        <Link to={`/trener/ishrana/${t.id}`} className="mt-5 inline-flex h-[42px] items-center rounded-full bg-white px-5 text-[13px] font-semibold text-background">
          Otvori plan
        </Link>
      </div>
      {ukupno > 0 && (
        <div className="flex items-center gap-5 rounded-[24px] bg-background/60 px-5 py-4 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.12)] backdrop-blur-xl">
          <div className="relative">
            <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden>
              {delovi.map((d) => {
                if (!d.g) return null;
                const l = (obim * d.g * d.kcal) / ukupno;
                const el = (
                  <circle key={d.kljuc} cx="52" cy="52" r="40" fill="none" stroke={d.boja} strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${Math.max(l - 5, 1)} ${obim}`} strokeDashoffset={-pomak} transform="rotate(-90 52 52)" />
                );
                pomak += l;
                return el;
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="fig text-[22px] leading-none">{t.target_kcal ?? Math.round(ukupno)}</span>
              <span className="text-[9.5px] text-muted-foreground">kcal</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 text-[12.5px] text-muted-foreground">
            {delovi.map((d) => (
              <span key={d.kljuc} className="flex items-baseline">
                <i className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: d.boja }} />
                <b className="fig mr-1.5 text-[17px] text-foreground">{d.g} g</b>
                {d.ime}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
