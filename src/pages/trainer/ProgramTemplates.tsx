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
import { Plus, ClipboardList, ChevronRight, Loader2, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/useConfirm";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { LockMark } from "@/components/pretplata/LockMark";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { MUSCLE_LABELS } from "@/lib/muscleGroups";

type Template = {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;
  level: string | null;
  created_at: string;
};

type VezbeProgra = { broj: number; slike: string[]; misici: Record<string, number> };

const ProgramTemplates = () => {
  const { locked, openLock, guard } = usePretplataLock();
  const { user } = useAuth();
  const confirm = useConfirm();
  const desktop = useDesktopWeb();
  const [items, setItems] = useState<Template[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [vezbe, setVezbe] = useState<Record<string, VezbeProgra>>({});
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
      toast.error(porukaGreske(error));
    } else {
      setItems((data as any) ?? []);
      // count days per template
      const ids = (data ?? []).map((t: any) => t.id);
      if (ids.length) {
        const { data: days } = await supabase
          .from("program_template_days")
          .select("id, template_id")
          .in("template_id", ids);
        const c: Record<string, number> = {};
        (days ?? []).forEach((d: any) => { c[d.template_id] = (c[d.template_id] ?? 0) + 1; });
        setCounts(c);
        // Racunar: slicice vezbi i udeo misica po programu (vrh i kartice).
        if (desktop && days?.length) {
          const danUProgram = new Map<string, string>();
          days.forEach((d: any) => danUProgram.set(d.id, d.template_id));
          const { data: vezbe } = await supabase
            .from("program_template_exercises")
            .select("day_id, exercise_id, position, sets, exercises(thumbnail_url, primary_muscle)")
            .in("day_id", days.map((d: any) => d.id))
            .order("position");
          const po: Record<string, VezbeProgra> = {};
          ((vezbe as any[]) ?? []).forEach((v) => {
            const tid = danUProgram.get(v.day_id);
            if (!tid) return;
            const z = (po[tid] ??= { broj: 0, slike: [], misici: {} });
            z.broj += 1;
            const url = v.exercises?.thumbnail_url as string | null | undefined;
            if (url && !z.slike.includes(url)) z.slike.push(url);
            const m = v.exercises?.primary_muscle as string | null | undefined;
            if (m && m !== "kardio") z.misici[m] = (z.misici[m] ?? 0) + Math.max(1, v.sets ?? 1);
          });
          setVezbe(po);
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDeleteTemplate = async (t: Template) => {
    if (locked) return openLock();
    if (!(await confirm({
      title: "Obrisati program?",
      description: "Program će biti trajno obrisan. Vežbači kojima je dodeljen zadržavaju svoju kopiju.",
      destructive: true,
    }))) return;
    // CASCADE brise dane/vezbe; assigned_programs.source_template_id -> SET NULL.
    const { error } = await supabase.from("program_templates").delete().eq("id", t.id);
    if (error) { toast.error(porukaGreske(error)); return; }
    toast.success("Program obrisan");
    load();
  };

  const handleCreate = async (e: React.FormEvent) => {
    if (locked) return openLock();
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
    if (error) { toast.error(porukaGreske(error)); return; }
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
      desktopWidth="wide"
      action={
        desktop ? (
          <Button
            onClick={guard(() => setOpen(true))}
            className="h-10 rounded-full px-4 bg-gradient-brand text-white shadow-brand"
          >
            <LockMark className="mr-1.5" />
            <Plus className="h-4 w-4 mr-1.5" strokeWidth={2.5} />
            Novi program
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
      <FullScreenSheet open={open} onClose={() => setOpen(false)} title="Novi program">
        <form onSubmit={handleCreate} className="flex flex-1 min-h-0 flex-col">
          <FullScreenSheetScroll className="pt-5 space-y-3">
            <div>
              <Label htmlFor="p-name">Naziv programa</Label>
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="npr. Push Pull Legs" className="mt-1.5 h-14 text-base rounded-2xl" autoFocus />
            </div>
            <div>
              <Label htmlFor="p-desc">Opis (opciono)</Label>
              <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="p-goal">Cilj</Label>
                <Input id="p-goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Hipertrofija" className="mt-1.5 h-14 text-base rounded-2xl" />
              </div>
              <div>
                <Label htmlFor="p-level">Nivo</Label>
                <Input id="p-level" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Srednji" className="mt-1.5 h-14 text-base rounded-2xl" />
              </div>
            </div>
          </FullScreenSheetScroll>
          <FullScreenSheetFooter>
            <Button type="submit" disabled={submitting} className="w-full bg-gradient-brand text-white shadow-brand">
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <LockMark className="mr-1.5" />Kreiraj program
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
            <ClipboardList className="h-6 w-6 text-primary" strokeWidth={2} />
          </div>
          <h3 className="font-display text-lg font-bold mb-1">Nemaš programa</h3>
          <p className="text-sm text-muted-foreground mb-4 px-8">
            Kreiraj prvi program i dodeli ga svojim vežbačima.
          </p>
          <Button onClick={guard(() => setOpen(true))}>
            <LockMark className="mr-1.5" /><Plus className="h-4 w-4 mr-1.5" /> Novi program
          </Button>
        </div>
      ) : desktop ? (
        // Racunar: mreza kartica. Pune trake preko cele sirine su izgledale izduzeno
        // i prazno; kartica drzi naziv, opis i oznake zajedno.
        <div className="space-y-5">
        <VrhPrograma t={items[0]} dana={counts[items[0].id] ?? 0} vezbe={vezbe[items[0].id]} />
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((t) => {
            const brojDana = counts[t.id] ?? 0;
            const slike = vezbe[t.id]?.slike.slice(0, 4) ?? [];
            return (
              <div key={t.id} className="group card-premium-hover relative flex min-h-[176px] flex-col p-5">
                {/* Link preko cele kartice; dugme za brisanje je iznad njega (z-10). */}
                <Link
                  to={`/trener/programi/${t.id}`}
                  aria-label={`Otvori program ${t.name}`}
                  className="absolute inset-0 rounded-[inherit]"
                />
                <div className="flex items-start justify-between gap-3">
                  {slike.length > 0 ? (
                    <div className="flex">
                      {slike.map((url, i) => (
                        <i
                          key={url}
                          className={`h-[54px] w-[54px] rounded-[15px] bg-[#E9E5F2] bg-contain bg-center bg-no-repeat bg-blend-multiply shadow-[0_0_0_3px_hsl(var(--surface))] ${i ? "-ml-3" : ""}`}
                          style={{ backgroundImage: `url(${url})` }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="h-11 w-11 rounded-xl bg-gradient-brand-soft flex items-center justify-center">
                      <ClipboardList className="h-5 w-5 text-primary" strokeWidth={2.25} />
                    </div>
                  )}
                  <button
                    onClick={() => handleDeleteTemplate(t)}
                    aria-label="Obriši program"
                    className="relative z-10 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground opacity-0 transition hover:bg-destructive-soft hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4 font-display text-[17px] font-bold leading-snug tracking-tight">
                  {t.name}
                </div>
                {t.description && (
                  <p className="mt-1 text-[13px] text-muted-foreground line-clamp-2">{t.description}</p>
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
                  {t.level && (
                    <span className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground">
                      {t.level}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <button
            onClick={guard(() => setOpen(true))}
            className="flex min-h-[176px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-hairline text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <Plus className="h-5 w-5" />
            <span className="text-sm font-semibold">Novi program</span>
          </button>
        </div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            <div key={t.id} className="card-premium-hover flex items-center gap-3 p-4">
              <Link to={`/trener/programi/${t.id}`} className="flex items-center gap-3 flex-1 min-w-0">
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
              <button
                onClick={() => handleDeleteTemplate(t)}
                aria-label="Obriši program"
                className="h-9 w-9 rounded-full hover:bg-destructive-soft flex items-center justify-center text-muted-foreground hover:text-destructive transition shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </PhoneShell>
  );
};

// Racunar: vrh sa najnovijim programom, lepezom slicica vezbi i udelom misica.
const VrhPrograma = ({ t, dana, vezbe }: { t: Template; dana: number; vezbe?: VezbeProgra }) => {
  const slike = vezbe?.slike.slice(0, 5) ?? [];
  const sredina = (slike.length - 1) / 2;
  const misici = Object.entries(vezbe?.misici ?? {}).sort((a, b) => b[1] - a[1]);
  const ukupno = misici.reduce((s, [, n]) => s + n, 0);
  const vrh = misici.slice(0, 4);
  const najveci = vrh[0]?.[1] ?? 1;
  return (
    <section
      className="relative grid min-h-[216px] grid-cols-[minmax(0,1fr)_290px_220px] items-center gap-8 overflow-hidden rounded-[28px] border border-hairline px-7 py-6"
      style={{ background: "linear-gradient(120deg, hsl(267 81% 58% / 0.24), hsl(258 22% 9% / 0.1) 55%, hsl(323 72% 59% / 0.12))" }}
    >
      <div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
          Najnoviji program · {dana} {dana === 1 ? "dan" : "dana"}
        </span>
        <h2 className="mt-1.5 font-display text-[32px] font-bold leading-[1.05] tracking-[-0.03em]">{t.name}</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {t.goal && <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary-soft-foreground">{t.goal}</span>}
          {t.level && <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{t.level}</span>}
          {(vezbe?.broj ?? 0) > 0 && (
            <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-muted-foreground tnum">
              {vezbe!.broj} {vezbe!.broj % 10 === 1 && vezbe!.broj % 100 !== 11 ? "vežba" : [2, 3, 4].includes(vezbe!.broj % 10) && ![12, 13, 14].includes(vezbe!.broj % 100) ? "vežbe" : "vežbi"}
            </span>
          )}
        </div>
        <Link to={`/trener/programi/${t.id}`} className="mt-5 inline-flex h-[42px] items-center rounded-full bg-white px-5 text-[13px] font-semibold text-background">
          Otvori program
        </Link>
      </div>
      <div className="relative h-[168px]">
        {slike.map((url, i) => {
          const k = i - sredina;
          return (
            <i
              key={url}
              className="absolute left-1/2 top-3.5 -ml-[52px] h-[140px] w-[104px] rounded-[18px] bg-[#E9E5F2] bg-contain bg-center bg-no-repeat bg-blend-multiply shadow-[0_22px_40px_-18px_rgba(0,0,0,0.9),0_0_0_3px_hsl(258_22%_9%/0.9)]"
              style={{ backgroundImage: `url(${url})`, zIndex: 10 - Math.round(Math.abs(k) * 2), transform: `translateX(${k * 46}px) rotate(${k * 9}deg) translateY(${Math.abs(k) * 7}px)` }}
            />
          );
        })}
      </div>
      <div className="flex flex-col gap-[11px]">
        {vrh.length === 0 ? (
          <span className="text-[12px] text-muted-foreground">Dodaj vežbe u program da vidiš udeo mišića.</span>
        ) : (
          vrh.map(([m, n]) => (
            <div key={m} className="grid grid-cols-[74px_1fr_38px] items-center gap-2.5 text-[12px] text-muted-foreground">
              <span>{MUSCLE_LABELS[m] ?? m}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <i className="block h-full rounded-full bg-gradient-brand" style={{ width: `${Math.round((n / najveci) * 90)}%` }} />
              </span>
              <b className="text-right font-semibold text-foreground tnum">{Math.round((n / ukupno) * 100)}%</b>
            </div>
          ))
        )}
      </div>
    </section>
  );
};

export default ProgramTemplates;
