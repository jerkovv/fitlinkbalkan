import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, ChevronRight, Loader2, Pencil, Plus, Ruler } from "lucide-react";
import { toast } from "sonner";
import {
  FullScreenSheet,
  FullScreenSheetFooter,
  FullScreenSheetScroll,
} from "@/components/ui/full-screen-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/hooks/useConfirm";
import { porukaGreske } from "@/lib/errorMessage";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { brojIzTeksta, brojTekst, danIzTeksta } from "./aktivnost";

type Kljuc =
  | "weight_kg" | "chest_cm" | "arm_left_cm" | "arm_right_cm" | "waist_cm"
  | "glutes_cm" | "thigh_left_cm" | "thigh_right_cm" | "body_fat_pct" | "bmi";

type Merenje = { id: string; recorded_on: string; notes: string | null; entered_by: string | null } & Partial<
  Record<Kljuc, number | null>
>;

type Smer = "manje" | "vise" | "poCilju";
type Mera = { k: Kljuc; naziv: string; kratko: string; jedinica: string; smer: Smer; od: number; do: number };

// Redosled kao na papiru kod trenera; opsezi su isti kao u bazi (body_metrics_opsezi).
const MERE: Mera[] = [
  { k: "weight_kg", naziv: "Težina", kratko: "Težina", jedinica: "kg", smer: "poCilju", od: 20, do: 400 },
  { k: "chest_cm", naziv: "Obim grudi", kratko: "Grudi", jedinica: "cm", smer: "vise", od: 30, do: 250 },
  { k: "arm_left_cm", naziv: "Ruka leva", kratko: "Leva", jedinica: "cm", smer: "vise", od: 10, do: 90 },
  { k: "arm_right_cm", naziv: "Ruka desna", kratko: "Desna", jedinica: "cm", smer: "vise", od: 10, do: 90 },
  { k: "waist_cm", naziv: "Obim struka", kratko: "Struk", jedinica: "cm", smer: "manje", od: 30, do: 250 },
  { k: "glutes_cm", naziv: "Obim gluteusa", kratko: "Gluteus", jedinica: "cm", smer: "poCilju", od: 30, do: 250 },
  { k: "thigh_left_cm", naziv: "Butina leva", kratko: "Leva", jedinica: "cm", smer: "poCilju", od: 20, do: 150 },
  { k: "thigh_right_cm", naziv: "Butina desna", kratko: "Desna", jedinica: "cm", smer: "poCilju", od: 20, do: 150 },
  { k: "body_fat_pct", naziv: "Procenat masti", kratko: "Masti", jedinica: "%", smer: "manje", od: 1, do: 75 },
  { k: "bmi", naziv: "BMI", kratko: "BMI", jedinica: "", smer: "poCilju", od: 8, do: 90 },
];
const mera = (k: Kljuc) => MERE.find((m) => m.k === k)!;
const KOLONE =
  "id,recorded_on,weight_kg,body_fat_pct,bmi,chest_cm,arm_left_cm,arm_right_cm,waist_cm,glutes_cm,thigh_left_cm,thigh_right_cm,notes,entered_by";

const vrednost = (u: Merenje, k: Kljuc): number | null => {
  const v = u[k];
  return v == null ? null : Number(v);
};
const uz = (v: number, j: string) => (j ? `${brojTekst(v)} ${j}` : brojTekst(v));
const razlika = (d: number) => {
  const r = Math.round(d * 10) / 10;
  if (r === 0) return "0";
  return `${r > 0 ? "+" : "-"}${brojTekst(Math.abs(r))}`;
};
const datumDug = (s: string) => {
  const d = danIzTeksta(s);
  const mesec = d.toLocaleDateString("sr-Latn-RS", { month: "short" }).replace(".", "");
  return `${d.getDate()}. ${mesec} ${d.getFullYear()}.`;
};
const datumKratak = (s: string) => {
  const d = danIzTeksta(s);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return d.getFullYear() === new Date().getFullYear()
    ? `${dd}.${mm}.`
    : `${dd}.${mm}.${String(d.getFullYear()).slice(2)}`;
};
const danasKljuc = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Zeleno je pomak ka cilju, narandzasto suprotno, ljubicasto samo pokazuje smer.
const bojaPomaka = (m: Mera, d: number, cilj: string | null) => {
  const zeljeno =
    m.smer === "manje" ? -1 : m.smer === "vise" ? 1 : cilj === "lose_weight" ? -1 : cilj === "gain_muscle" ? 1 : null;
  if (zeljeno == null) return "bg-primary-soft text-primary-soft-foreground";
  return (d < 0 ? -1 : 1) === zeljeno ? "bg-success/15 text-success" : "bg-warning/15 text-warning";
};

const legenda = (cilj: string | null) => {
  if (cilj === "lose_weight") return "Zeleno je pomak ka cilju (mršavljenje), narandžasto u suprotnom smeru.";
  if (cilj === "gain_muscle") return "Zeleno je pomak ka cilju (mišićna masa), narandžasto u suprotnom smeru.";
  return "Zeleno je dobar pomak (manje struka i masti, više grudi i ruku). Za težinu, gluteus, butine i BMI boja samo pokazuje smer dok cilj nije izabran.";
};

export const MerenjaVezbaca = ({ athleteId, onPromena }: { athleteId: string; onPromena: () => void }) => {
  const { guard } = usePretplataLock();
  const { user } = useAuth();
  const [unosi, setUnosi] = useState<Merenje[]>([]);
  const [visina, setVisina] = useState<number | null>(null);
  const [cilj, setCilj] = useState<string | null>(null);
  const [ucitava, setUcitava] = useState(true);
  const [greska, setGreska] = useState<string | null>(null);
  const [prviId, setPrviId] = useState<string | null>(null);
  const [drugiId, setDrugiId] = useState<string | null>(null);
  const [forma, setForma] = useState<{ postojeci: Merenje | null } | null>(null);
  const [sviOtvoreni, setSviOtvoreni] = useState(false);

  const ucitaj = useCallback(async () => {
    const [m, a] = await Promise.all([
      supabase
        .from("body_metrics")
        .select(KOLONE)
        .eq("athlete_id", athleteId)
        .order("recorded_on", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(500),
      supabase.from("athletes").select("height_cm, goal").eq("id", athleteId).maybeSingle(),
    ]);
    const err = m.error ?? a.error;
    if (err) {
      const poruka = porukaGreske(err);
      setGreska(poruka);
      toast.error(poruka);
      setUcitava(false);
      return;
    }
    const redovi = (m.data ?? []) as unknown as Merenje[];
    setUnosi(redovi);
    setVisina((a.data as any)?.height_cm != null ? Number((a.data as any).height_cm) : null);
    setCilj((a.data as any)?.goal ?? null);
    // Izbor za poredjenje vazi dok ti unosi postoje.
    setPrviId((p) => (p && redovi.some((u) => u.id === p) ? p : null));
    setDrugiId((d) => (d && redovi.some((u) => u.id === d) ? d : null));
    setGreska(null);
    setUcitava(false);
  }, [athleteId]);

  useEffect(() => {
    setUcitava(true);
    void ucitaj();
  }, [ucitaj]);

  const prvi = unosi.find((u) => u.id === prviId) ?? unosi[0] ?? null;
  const drugi = unosi.find((u) => u.id === drugiId) ?? unosi[unosi.length - 1] ?? null;
  const poslednji = unosi[unosi.length - 1];

  const podnaslov = poslednji
    ? `${unosi.length} ${unosi.length % 10 === 1 && unosi.length % 100 !== 11 ? "unos" : "unosa"} · poslednji ${datumDug(poslednji.recorded_on)}`
    : "Težina i obimi vežbača";

  const posleIzmene = async () => {
    await ucitaj();
    onPromena();
  };

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Telo</div>
          <h2 className="font-display text-[19px] font-bold tracking-tight">Merenja</h2>
          {!ucitava && !greska && <p className="mt-0.5 text-[12px] text-muted-foreground">{podnaslov}</p>}
        </div>
        <Button
          onClick={guard(() => setForma({ postojeci: null }))}
          className="h-9 shrink-0 rounded-full bg-gradient-brand px-3.5 text-[12.5px] text-white shadow-brand"
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Novo merenje
        </Button>
      </div>

      {ucitava ? (
        <div className="card-premium flex justify-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Učitavanje" />
        </div>
      ) : greska && unosi.length === 0 ? (
        <div className="card-premium p-5 text-center">
          <p className="text-[13px] text-muted-foreground">{greska}</p>
          <Button variant="outline" onClick={() => void ucitaj()} className="mt-3 h-9 rounded-full px-4 text-[13px]">
            Pokušaj ponovo
          </Button>
        </div>
      ) : unosi.length === 0 ? (
        <div className="card-premium flex items-start gap-3 p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground">
            <Ruler className="h-5 w-5" />
          </span>
          <div>
            <div className="text-[15px] font-semibold">Prvo merenje</div>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Upiši težinu, obime, body fat i BMI. Posle svakog sledećeg merenja tabela pokazuje šta je palo, a šta poraslo.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {["Težina", "Grudi", "Ruke", "Struk", "Gluteus", "Butine", "Masti", "BMI"].map((t) => (
                <span key={t} className="inline-flex h-[26px] items-center rounded-full bg-surface-2 px-2.5 text-[11px] font-medium text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : unosi.length === 1 ? (
        <JedanUnos unos={unosi[0]} />
      ) : (
        prvi && drugi && (
          <TabelaPoredjenja
            unosi={unosi}
            a={prvi}
            b={drugi}
            cilj={cilj}
            onPrvi={setPrviId}
            onDrugi={setDrugiId}
          />
        )
      )}

      {unosi.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setSviOtvoreni(true)}
            className="inline-flex min-h-8 items-center gap-1 text-[12.5px] font-semibold text-primary-soft-foreground transition hover:text-foreground"
          >
            Svi unosi ({unosi.length}) <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <FullScreenSheet
        open={sviOtvoreni && unosi.length > 0}
        onClose={() => setSviOtvoreni(false)}
        title="Svi unosi"
        size="list"
        hidden={forma != null}
      >
        <FullScreenSheetScroll className="space-y-3 pt-4">
          <p className="text-[12px] text-muted-foreground">
            Klikni unos da ga izmeniš, ili ga stavi u poređenje.
          </p>
          {[...unosi].reverse().map((u) => {
            const mereUnosa = MERE.filter((m) => vrednost(u, m.k) != null);
            const autor = u.entered_by ? (u.entered_by === user?.id ? "Ti" : "Vežbač") : null;
            return (
              <div key={u.id} className="card-premium p-3.5">
                <button
                  type="button"
                  onClick={guard(() => setForma({ postojeci: u }))}
                  className="block w-full text-left"
                  aria-label={`Izmeni merenje od ${datumDug(u.recorded_on)}`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-semibold">{datumDug(u.recorded_on)}</span>
                    {autor && (
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10.5px] font-semibold text-primary-soft-foreground">
                        {autor}
                      </span>
                    )}
                    {prvi?.id === u.id && (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">1. u poređenju</span>
                    )}
                    {drugi?.id === u.id && (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">2. u poređenju</span>
                    )}
                    <span className="flex-1" />
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <span className="mt-2.5 flex flex-wrap gap-1.5">
                    {mereUnosa.map((m) => (
                      <span key={m.k} className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-2 px-2.5 text-[11.5px]">
                        <span className="text-muted-foreground">{m.kratko === "Leva" || m.kratko === "Desna" ? m.naziv : m.kratko}</span>
                        <b className="font-semibold tnum">{uz(vrednost(u, m.k)!, m.jedinica)}</b>
                      </span>
                    ))}
                  </span>
                  {u.notes && <span className="mt-2 block text-[12.5px] text-muted-foreground">{u.notes}</span>}
                </button>
                {unosi.length > 1 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-hairline pt-2.5">
                    <button
                      type="button"
                      disabled={drugi?.id === u.id}
                      onClick={() => setPrviId(u.id)}
                      className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-primary-soft-foreground transition hover:bg-surface-2 disabled:opacity-40"
                    >
                      Uporedi kao prvi unos
                    </button>
                    <button
                      type="button"
                      disabled={prvi?.id === u.id}
                      onClick={() => setDrugiId(u.id)}
                      className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-primary-soft-foreground transition hover:bg-surface-2 disabled:opacity-40"
                    >
                      Uporedi kao drugi unos
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </FullScreenSheetScroll>
      </FullScreenSheet>

      {forma && (
        <FormaMerenja
          athleteId={athleteId}
          postojeci={forma.postojeci}
          unosi={unosi}
          visina={visina}
          cilj={cilj}
          onClose={() => setForma(null)}
          onSacuvano={posleIzmene}
        />
      )}
    </section>
  );
};

const JedanUnos = ({ unos }: { unos: Merenje }) => {
  const mere = MERE.filter((m) => vrednost(unos, m.k) != null);
  return (
    <div className="card-premium p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Od</div>
      <div className="text-[14px] font-semibold">{datumDug(unos.recorded_on)}</div>
      <div className="mt-3 overflow-hidden rounded-xl border border-hairline">
        {mere.map((m, i) => (
          <div key={m.k} className={cn("flex min-h-10 items-center justify-between px-3", i % 2 === 1 && "bg-surface-2/40")}>
            <span className="text-[13px] font-semibold">{m.naziv}</span>
            <span className="text-[13.5px] font-semibold tnum">{uz(vrednost(unos, m.k)!, m.jedinica)}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-muted-foreground">
        Sledeće merenje dobija kolonu promene: vidi se šta je palo, a šta poraslo.
      </p>
    </div>
  );
};

const BiracUnosa = ({
  naslov, izabran, opcije, onIzbor,
}: {
  naslov: string; izabran: Merenje; opcije: Merenje[]; onIzbor: (id: string) => void;
}) => (
  <div className="min-w-0 flex-1">
    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{naslov}</div>
    <Select value={izabran.id} onValueChange={onIzbor}>
      <SelectTrigger className="h-10 rounded-xl bg-surface-2 text-[13px] font-semibold" aria-label={naslov}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opcije.map((x) => (
          <SelectItem key={x.id} value={x.id}>{datumDug(x.recorded_on)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

const TabelaPoredjenja = ({
  unosi, a, b, cilj, onPrvi, onDrugi,
}: {
  unosi: Merenje[]; a: Merenje; b: Merenje; cilj: string | null;
  onPrvi: (id: string) => void; onDrugi: (id: string) => void;
}) => {
  const mere = MERE.filter((m) => vrednost(a, m.k) != null || vrednost(b, m.k) != null);
  const noviPrvo = [...unosi].reverse();
  const dani = Math.abs(Math.round((danIzTeksta(b.recorded_on).getTime() - danIzTeksta(a.recorded_on).getTime()) / 86400000));
  const pomaci = (["weight_kg", "waist_cm", "body_fat_pct", "chest_cm", "glutes_cm"] as Kljuc[])
    .flatMap((k) => {
      const x = vrednost(a, k);
      const y = vrednost(b, k);
      return x != null && y != null && Math.abs(y - x) >= 0.05 ? [{ m: mera(k), d: y - x }] : [];
    })
    .slice(0, 3);

  return (
    <div className="card-premium space-y-3 p-4">
      <div className="flex items-end gap-2">
        <BiracUnosa naslov="Od" izabran={a} opcije={noviPrvo.filter((x) => x.id !== b.id)} onIzbor={onPrvi} />
        <ArrowRight className="mb-3 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <BiracUnosa naslov="Do" izabran={b} opcije={noviPrvo.filter((x) => x.id !== a.id)} onIzbor={onDrugi} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex h-7 items-center rounded-full bg-surface-2 px-2.5 text-[11.5px] font-semibold text-muted-foreground">
          {dani === 1 ? "za 1 dan" : `za ${dani} dana`}
        </span>
        {pomaci.map(({ m, d }) => (
          <span key={m.k} className={cn("inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-semibold tnum", bojaPomaka(m, d, cilj))}>
            {d < 0 ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
            {m.kratko} {razlika(d)}{m.jedinica ? ` ${m.jedinica}` : ""}
          </span>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-hairline">
        <div className="grid h-9 grid-cols-[minmax(0,1fr)_72px_72px_84px] items-center gap-1 bg-surface-2/70 px-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <span>Mera</span>
          <span className="text-right tnum">{datumKratak(a.recorded_on)}</span>
          <span className="text-right tnum">{datumKratak(b.recorded_on)}</span>
          <span className="text-right">Promena</span>
        </div>
        {mere.map((m, i) => {
          const x = vrednost(a, m.k);
          const y = vrednost(b, m.k);
          const d = x != null && y != null ? Math.round((y - x) * 10) / 10 : null;
          return (
            <div key={m.k} className={cn("grid min-h-[40px] grid-cols-[minmax(0,1fr)_72px_72px_84px] items-center gap-1 px-3 py-1", i % 2 === 1 && "bg-surface-2/40")}>
              <span className="text-[12.5px] font-semibold">
                {m.naziv}
                {m.jedinica && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{m.jedinica}</span>}
              </span>
              <span className="text-right text-[13px] text-muted-foreground tnum">{x != null ? brojTekst(x) : "-"}</span>
              <span className="text-right text-[13px] font-semibold tnum">{y != null ? brojTekst(y) : "-"}</span>
              <span className="flex justify-end">
                {d == null ? (
                  <span className="text-[12.5px] text-muted-foreground">-</span>
                ) : d === 0 ? (
                  <span className="text-[12.5px] font-semibold text-muted-foreground tnum">0</span>
                ) : (
                  <span className={cn("inline-flex h-6 items-center gap-0.5 rounded-full px-1.5 text-[12px] font-bold tnum", bojaPomaka(m, d, cilj))}>
                    {d < 0 ? <ArrowDown className="h-2.5 w-2.5" /> : <ArrowUp className="h-2.5 w-2.5" />}
                    {razlika(d)}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">{legenda(cilj)}</p>
    </div>
  );
};

const FormaMerenja = ({
  athleteId, postojeci, unosi, visina, cilj, onClose, onSacuvano,
}: {
  athleteId: string;
  postojeci: Merenje | null;
  unosi: Merenje[];
  visina: number | null;
  cilj: string | null;
  onClose: () => void;
  onSacuvano: () => Promise<void>;
}) => {
  const { locked, openLock } = usePretplataLock();
  const confirm = useConfirm();
  const [datum, setDatum] = useState(postojeci?.recorded_on.slice(0, 10) ?? danasKljuc());

  const prethodno = useCallback(
    (k: Kljuc, doDana: string) => {
      for (let i = unosi.length - 1; i >= 0; i -= 1) {
        const u = unosi[i];
        if (u.id !== postojeci?.id && vrednost(u, k) != null && u.recorded_on.slice(0, 10) <= doDana) {
          return vrednost(u, k);
        }
      }
      return null;
    },
    [unosi, postojeci],
  );

  const [imaTezinu, setImaTezinu] = useState(postojeci ? postojeci.weight_kg != null : true);
  const [polja, setPolja] = useState<Partial<Record<Kljuc, string>>>(() => {
    const p: Partial<Record<Kljuc, string>> = {};
    if (postojeci) {
      MERE.forEach((m) => {
        if (m.k === "bmi" && visina != null) return;
        const v = vrednost(postojeci, m.k);
        if (v != null) p[m.k] = brojTekst(v);
      });
    }
    const zaTezinu = p.weight_kg ?? (() => {
      const t = prethodno("weight_kg", postojeci?.recorded_on.slice(0, 10) ?? danasKljuc());
      return t != null ? brojTekst(t) : "";
    })();
    p.weight_kg = zaTezinu;
    return p;
  });
  const [visinaTekst, setVisinaTekst] = useState("");
  const [beleska, setBeleska] = useState(postojeci?.notes ?? "");
  const [cuva, setCuva] = useState(false);
  const [potvrda, setPotvrda] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const h = visina ?? brojIzTeksta(visinaTekst);
  const visinaVazi = h != null && h >= 100 && h <= 250;
  const tezinaBroj = brojIzTeksta(polja.weight_kg ?? "");
  const bmiZiv = useMemo(
    () => (visinaVazi && imaTezinu && tezinaBroj != null ? brojTekst(tezinaBroj / (h! / 100) ** 2) : "-"),
    [visinaVazi, imaTezinu, tezinaBroj, h],
  );

  const sacuvaj = async () => {
    if (locked) return openLock();
    const v: Partial<Record<Kljuc, number>> = {};
    for (const m of MERE) {
      if (m.k === "weight_kg" && !imaTezinu) continue;
      const t = (polja[m.k] ?? "").trim();
      if (!t) {
        if (m.k === "weight_kg") {
          setProblem("Upiši težinu ili je isključi za ovo merenje.");
          return;
        }
        continue;
      }
      const x = brojIzTeksta(t);
      if (x == null) {
        setProblem(`${m.naziv}: upiši broj.`);
        return;
      }
      v[m.k] = m.k === "weight_kg" ? Math.round(x * 10) / 10 : x;
    }
    let novaVisina: number | null = null;
    if (visina == null && visinaTekst.trim()) {
      const x = brojIzTeksta(visinaTekst);
      if (x == null) {
        setProblem("Visina: upiši broj od 100 do 250 cm.");
        return;
      }
      novaVisina = Math.round(x);
    }
    // Kad je visina poznata (ili se sad upisuje), BMI racuna baza.
    if (visina != null || novaVisina != null) delete v.bmi;
    if (Object.keys(v).length === 0) {
      setProblem("Upiši bar jednu meru.");
      return;
    }
    for (const m of MERE) {
      const x = v[m.k];
      if (x != null && (x < m.od || x > m.do)) {
        setProblem(`${m.naziv}: upiši broj od ${brojTekst(m.od)} do ${brojTekst(m.do)}${m.jedinica ? ` ${m.jedinica}` : ""}.`);
        return;
      }
    }
    if (novaVisina != null && (novaVisina < 100 || novaVisina > 250)) {
      setProblem("Visina: upiši broj od 100 do 250 cm.");
      return;
    }
    if (datum > danasKljuc()) {
      setProblem("Datum merenja ne može da bude u budućnosti.");
      return;
    }
    setProblem(null);
    setCuva(true);
    try {
      if (novaVisina != null) {
        // Posle ovoga baza preracuna BMI i starim merenjima.
        const { error } = await supabase.rpc("trainer_update_athlete", {
          p_athlete_id: athleteId,
          p_izmene: { height_cm: novaVisina },
        });
        if (error) throw error;
      }
      const poznataVisina = visina != null || novaVisina != null;
      const red: Record<string, unknown> = { recorded_on: datum };
      for (const m of MERE) {
        if (m.k === "bmi" && poznataVisina) {
          if (v.weight_kg == null && postojeci) red.bmi = null;
          continue;
        }
        const x = v[m.k];
        if (x != null) red[m.k] = x;
        else if (postojeci) red[m.k] = null;
      }
      const b = beleska.trim();
      if (b) red.notes = b;
      else if (postojeci) red.notes = null;

      if (postojeci) {
        const { error } = await supabase.from("body_metrics").update(red).eq("id", postojeci.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("body_metrics").insert({ ...red, athlete_id: athleteId });
        if (error) throw error;
      }
      await onSacuvano();
      toast.success("Merenje je sačuvano.");
      onClose();
    } catch (e) {
      toast.error(porukaGreske(e));
    } finally {
      setCuva(false);
    }
  };

  const obrisi = async () => {
    if (!postojeci) return;
    if (locked) return openLock();
    // Potvrda je ispod ovog sloja, pa se sloj sklanja dok je otvorena.
    setPotvrda(true);
    const da = await confirm({
      title: "Obrisati ovo merenje?",
      description: `Unos od ${datumDug(postojeci.recorded_on)} nestaje iz tabele.`,
      destructive: true,
    });
    setPotvrda(false);
    if (!da) return;
    setCuva(true);
    try {
      const { error } = await supabase.from("body_metrics").delete().eq("id", postojeci.id);
      if (error) throw error;
      await onSacuvano();
      toast.success("Unos je obrisan.");
      onClose();
    } catch (e) {
      toast.error(porukaGreske(e));
    } finally {
      setCuva(false);
    }
  };

  const polje = (k: Kljuc) => {
    const m = mera(k);
    const pre = prethodno(k, datum);
    const sada = brojIzTeksta(polja[k] ?? "");
    const d = pre != null && sada != null ? Math.round((sada - pre) * 10) / 10 : 0;
    const id = `mer-${k}`;
    return (
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1">
          <Label htmlFor={id} className="text-[11.5px] font-semibold text-muted-foreground">{m.kratko}</Label>
          {d !== 0 && (
            <span className={cn("rounded-full px-1.5 text-[10.5px] font-bold tnum", bojaPomaka(m, d, cilj))}>{razlika(d)}</span>
          )}
        </div>
        <div className="relative mt-1">
          <Input
            id={id}
            inputMode="decimal"
            value={polja[k] ?? ""}
            onChange={(e) => setPolja((p) => ({ ...p, [k]: e.target.value.replace(/[^\d.,]/g, "") }))}
            placeholder={pre != null ? brojTekst(pre) : "-"}
            className={cn("h-11 rounded-xl text-[15px] font-semibold tnum", m.jedinica && "pr-9")}
          />
          {m.jedinica && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">{m.jedinica}</span>
          )}
        </div>
        <div className="mt-1 text-[10.5px] text-muted-foreground">
          {pre != null ? `prošli put ${uz(pre, m.jedinica)}` : "prvo merenje"}
        </div>
      </div>
    );
  };

  const prosla = prethodno("weight_kg", datum);
  const rTezine = prosla != null && tezinaBroj != null ? Math.round((tezinaBroj - prosla) * 10) / 10 : null;

  return (
    <FullScreenSheet
      open
      onClose={onClose}
      title={postojeci ? "Izmena merenja" : "Novo merenje"}
      hidden={potvrda}
    >
      <FullScreenSheetScroll className="space-y-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="mer-datum" className="text-[13.5px] font-semibold">Datum merenja</Label>
          <Input
            id="mer-datum"
            type="date"
            value={datum}
            max={danasKljuc()}
            onChange={(e) => setDatum(e.target.value || danasKljuc())}
            className="h-10 w-[170px] rounded-xl"
          />
        </div>

        <div className="rounded-2xl bg-gradient-brand p-4 text-white">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/85">Težina</span>
            <Switch checked={imaTezinu} onCheckedChange={setImaTezinu} aria-label="Težina u ovom merenju" />
          </div>
          {imaTezinu ? (
            <>
              <div className="mt-1 flex items-baseline gap-1.5">
                <input
                  aria-label="Težina u kilogramima"
                  inputMode="decimal"
                  value={polja.weight_kg ?? ""}
                  onChange={(e) => setPolja((p) => ({ ...p, weight_kg: e.target.value.replace(/[^\d.,]/g, "") }))}
                  placeholder="Upiši"
                  className="fig w-[150px] bg-transparent text-[44px] leading-none text-white placeholder:text-white/50 focus:outline-none"
                />
                <span className="text-[15px] font-semibold text-white/85">kg</span>
              </div>
              {rTezine != null && prosla != null && (
                <div className="mt-2 inline-flex rounded-full bg-white/20 px-2.5 py-1 text-[11.5px] font-semibold tnum">
                  {rTezine === 0 ? "isto kao prošli put" : `${razlika(rTezine)} kg od prošlog (${brojTekst(prosla)})`}
                </div>
              )}
            </>
          ) : (
            <div className="mt-2 text-[15px] font-semibold">Bez težine u ovom merenju</div>
          )}
        </div>

        <div className="card-premium space-y-3 p-4">
          <div>
            <div className="text-[15px] font-semibold">Sastav tela</div>
            <div className="text-[11.5px] text-muted-foreground">Procenat masti sa vage ili kalipera</div>
          </div>
          <div className="flex items-start gap-2.5">
            {polje("body_fat_pct")}
            {visinaVazi ? (
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] font-semibold text-muted-foreground">BMI</div>
                <div className="mt-1 flex h-11 items-center rounded-xl border border-primary/25 bg-primary-soft/50 px-3 text-[15px] font-semibold tnum">
                  {bmiZiv}
                </div>
                <div className="mt-1 text-[10.5px] text-muted-foreground">iz visine {brojTekst(h!)} cm</div>
              </div>
            ) : (
              polje("bmi")
            )}
          </div>
          {visina == null && (
            <div>
              <Label htmlFor="mer-visina" className="text-[11.5px] font-semibold text-muted-foreground">Visina</Label>
              <div className="relative mt-1">
                <Input
                  id="mer-visina"
                  inputMode="decimal"
                  value={visinaTekst}
                  onChange={(e) => setVisinaTekst(e.target.value.replace(/[^\d.,]/g, ""))}
                  placeholder="npr. 178"
                  className="h-11 rounded-xl pr-9 text-[15px] font-semibold tnum"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">cm</span>
              </div>
              <div className="mt-1 text-[10.5px] text-muted-foreground">
                Upisuje se jednom. Posle toga BMI se računa sam, i za stara merenja.
              </div>
            </div>
          )}
        </div>

        <div className="card-premium space-y-3 p-4">
          <div>
            <div className="text-[15px] font-semibold">Obimi</div>
            <div className="text-[11.5px] text-muted-foreground">U centimetrima. Prazno polje se preskače.</div>
          </div>
          {polje("chest_cm")}
          <div>
            <div className="mb-1 text-[12px] font-semibold">Ruka</div>
            <div className="flex items-start gap-2.5">{polje("arm_left_cm")}{polje("arm_right_cm")}</div>
          </div>
          {polje("waist_cm")}
          {polje("glutes_cm")}
          <div>
            <div className="mb-1 text-[12px] font-semibold">Butina</div>
            <div className="flex items-start gap-2.5">{polje("thigh_left_cm")}{polje("thigh_right_cm")}</div>
          </div>
        </div>

        <div>
          <Label htmlFor="mer-beleska" className="text-[13px] font-semibold text-muted-foreground">Beleška</Label>
          <Textarea
            id="mer-beleska"
            value={beleska}
            onChange={(e) => setBeleska(e.target.value)}
            placeholder="Npr. ujutru, pre doručka"
            rows={2}
            className="mt-1.5 rounded-2xl text-[13.5px]"
          />
        </div>
        {problem && <p role="alert" className="text-[12.5px] font-medium text-destructive">{problem}</p>}
      </FullScreenSheetScroll>
      <FullScreenSheetFooter>
        <div className="space-y-1.5">
          <Button
            onClick={() => void sacuvaj()}
            disabled={cuva}
            className="h-12 w-full rounded-2xl bg-gradient-brand text-white shadow-brand"
          >
            {cuva && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {cuva ? "Čuvam..." : "Sačuvaj merenje"}
          </Button>
          {postojeci && (
            <button
              type="button"
              onClick={() => void obrisi()}
              disabled={cuva}
              className="h-10 w-full rounded-xl text-[13.5px] font-semibold text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
            >
              Obriši ovaj unos
            </button>
          )}
        </div>
      </FullScreenSheetFooter>
    </FullScreenSheet>
  );
};
