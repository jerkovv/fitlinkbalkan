import { useEffect, useMemo, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { porukaGreske } from "@/lib/errorMessage";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SerijaZaIspravku = {
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  logged_by_trainer: boolean | null;
};

export type IspravljenaSerija = { set_number: number; reps: number; weight_kg: number };

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sessionId: string;
  vezba: { id: string; name: string };
  serije: SerijaZaIspravku[];
  onSaved: (izmene: IspravljenaSerija[]) => void;
};

// "62,5" i "62.5" su isto; prazno = nije uneto; ostalo sto nije broj = NaN.
const uBroj = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

const PORUKE: Record<string, string> = {
  trainer_value: "Tu seriju je upisao trener, njegov broj ostaje.",
  session_ended: "Trening je završen, serije se više ne menjaju ovde.",
  not_logged: "Ta serija još nije završena.",
  invalid_reps: "Broj ponavljanja nije ispravan.",
  invalid_weight: "Kilaža nije ispravna.",
};

/**
 * Ispravka vec zavrsenih serija jedne vezbe, usred treninga. Vezbac je mogao samo
 * napred, pa je pogresno uneta kilaza na prethodnoj vezbi ostajala zauvek - u
 * istoriji i u "Prosli put". Menja se samo broj; serija koju je upisao trener je
 * zakljucana (trenerov broj je konacan, vidi athlete_update_set).
 */
export const IspraviSerijeSheet = ({ open, onOpenChange, sessionId, vezba, serije, onSaved }: Props) => {
  const [polja, setPolja] = useState<Record<number, { kg: string; reps: string }>>({});
  const [cuvam, setCuvam] = useState(false);

  const sortirane = useMemo(
    () => [...serije].sort((a, b) => a.set_number - b.set_number),
    [serije],
  );
  // Roditelj pravi niz na svaki render (ekran treninga tika svake sekunde), pa se
  // polja pune samo kad se sadrzaj stvarno promeni - inace bi brisala ono sto se kuca.
  const kljuc = sortirane.map((s) => `${s.set_number}:${s.reps}:${s.weight_kg}`).join("|");
  useEffect(() => {
    if (!open) return;
    const p: Record<number, { kg: string; reps: string }> = {};
    sortirane.forEach((s) => {
      p[s.set_number] = {
        kg: s.weight_kg != null ? String(Number(s.weight_kg)) : "",
        reps: s.reps != null ? String(s.reps) : "",
      };
    });
    setPolja(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vezba.id, kljuc]);

  const stavke = sortirane.map((s) => {
    const p = polja[s.set_number];
    const kg = p ? uBroj(p.kg) : null;
    const reps = p ? uBroj(p.reps) : null;
    const zakljucana = !!s.logged_by_trainer;
    const ispravna =
      kg != null && !Number.isNaN(kg) && kg >= 0 && kg <= 1000 &&
      reps != null && !Number.isNaN(reps) && Number.isInteger(reps) && reps >= 0 && reps <= 1000;
    const promenjena =
      !zakljucana && ispravna &&
      (kg !== Number(s.weight_kg ?? 0) || reps !== Number(s.reps ?? 0));
    return { s, p, kg, reps, zakljucana, ispravna, promenjena };
  });
  const promenjene = stavke.filter((x) => x.promenjena);
  const imaNeispravnih = stavke.some((x) => !x.zakljucana && !x.ispravna);
  const mozeCuvanje = promenjene.length > 0 && !imaNeispravnih && !cuvam;

  const sacuvaj = async () => {
    if (!mozeCuvanje) return;
    setCuvam(true);
    const sacuvane: IspravljenaSerija[] = [];
    for (const x of promenjene) {
      const { data, error } = await supabase.rpc("athlete_update_set" as any, {
        p_session_id: sessionId,
        p_ape_id: vezba.id,
        p_set_number: x.s.set_number,
        p_reps: x.reps,
        p_weight: x.kg,
      });
      if (error) {
        toast.error(porukaGreske(error));
        break;
      }
      const res = data as { success?: boolean; error?: string } | null;
      if (res && res.success === false) {
        toast.error(PORUKE[res.error ?? ""] ?? "Serija nije sačuvana. Pokušaj ponovo.");
        break;
      }
      sacuvane.push({ set_number: x.s.set_number, reps: x.reps as number, weight_kg: x.kg as number });
    }
    setCuvam(false);
    if (sacuvane.length) {
      onSaved(sacuvane);
      if (sacuvane.length === promenjene.length) {
        toast.success(sacuvane.length === 1 ? "Serija je ispravljena" : "Serije su ispravljene");
        onOpenChange(false);
      }
    }
  };

  const postavi = (n: number, polje: "kg" | "reps", vrednost: string) =>
    setPolja((prev) => ({ ...prev, [n]: { ...(prev[n] ?? { kg: "", reps: "" }), [polje]: vrednost } }));

  const inputKlase =
    "h-11 w-full rounded-xl border border-hairline bg-background text-center text-[15px] font-semibold tnum outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/30";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-auto max-h-[85dvh] w-full max-w-[440px] mx-auto rounded-t-3xl p-0 flex flex-col"
      >
        <SheetTitle className="sr-only">Ispravi serije</SheetTitle>
        <SheetDescription className="sr-only">
          Promeni kilažu i ponavljanja na serijama koje su već završene.
        </SheetDescription>

        <div className="px-5 pt-5 pb-3 pr-12">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Ispravi serije
          </div>
          <h2 className="mt-0.5 font-display text-lg font-bold tracking-tighter line-clamp-2">{vezba.name}</h2>
        </div>

        <div className="overflow-y-auto px-5 pb-2">
          <div className="grid grid-cols-[56px_1fr_1fr] gap-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Serija</span>
            <span className="text-center">Kg</span>
            <span className="text-center">Ponavljanja</span>
          </div>
          {stavke.map(({ s, p, zakljucana, ispravna }) => (
            <div key={s.set_number} className="grid grid-cols-[56px_1fr_1fr] items-center gap-2 py-1.5">
              <span className="text-[14px] font-bold tnum">{s.set_number}</span>
              {zakljucana ? (
                <div className="col-span-2 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-surface-2 text-[12.5px] text-muted-foreground tnum">
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  {Number(s.weight_kg ?? 0)} kg × {s.reps ?? "-"} · upisao trener
                </div>
              ) : (
                <>
                  <input
                    inputMode="decimal"
                    value={p?.kg ?? ""}
                    onChange={(e) => postavi(s.set_number, "kg", e.target.value)}
                    aria-label={`Kilaža, serija ${s.set_number}`}
                    className={cn(inputKlase, !ispravna && "border-destructive/60")}
                  />
                  <input
                    inputMode="numeric"
                    value={p?.reps ?? ""}
                    onChange={(e) => postavi(s.set_number, "reps", e.target.value)}
                    aria-label={`Ponavljanja, serija ${s.set_number}`}
                    className={cn(inputKlase, !ispravna && "border-destructive/60")}
                  />
                </>
              )}
            </div>
          ))}
        </div>

        <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] border-t border-hairline">
          <Button
            onClick={sacuvaj}
            disabled={!mozeCuvanje}
            size="lg"
            className="w-full bg-gradient-brand text-white shadow-brand hover:opacity-95"
          >
            {cuvam && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Sačuvaj izmene
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default IspraviSerijeSheet;
