import { History } from "lucide-react";
import type { LastPerformance } from "@/hooks/useLastPerformance";
import { cn } from "@/lib/utils";

const broj = (n: number) => String(n).replace(".", ",");

/** "60 kg × 10"; bez kilaze (sopstvena tezina) "10 reps", bez ponavljanja "60 kg". */
export const serijaTekst = (reps: number | null | undefined, kg: number | null | undefined) => {
  const k = kg != null && Number(kg) > 0 ? `${broj(Number(kg))} kg` : null;
  if (k && reps != null) return `${k} × ${reps}`;
  if (k) return k;
  return reps != null ? `${reps} reps` : "-";
};

// Po kalendarskim danima, ne po 24h: jucerasnji vecernji trening je "juce" i ujutru.
const kadaTekst = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  const sad = new Date();
  const dani = Math.round(
    (new Date(sad.getFullYear(), sad.getMonth(), sad.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86400000,
  );
  if (dani <= 0) return "danas";
  if (dani === 1) return "juče";
  return `pre ${dani} ${dani % 10 === 1 && dani % 100 !== 11 ? "dan" : "dana"}`;
};

// 1 serija, 2-4 serije, 5+ serija (21 serija, 22 serije).
const serijeRec = (n: number) => {
  const j = n % 10;
  const d = n % 100;
  return j >= 2 && j <= 4 && !(d >= 12 && d <= 14) ? "serije" : "serija";
};

type Props = {
  prosli: LastPerformance | undefined;
  /** Serija koja se sad radi - njen par sa proslog puta je istaknut. */
  trenutnaSerija: number;
};

/**
 * Ceo prosli trening za ovu vezbu u jednoj traci: kad je bio, koliko serija i
 * svaka serija kao "60 kg × 10". Sve serije su tu, pa se vidi i kad je prosli
 * put bilo vise serija nego danas.
 */
export const ProsliPutTraka = ({ prosli, trenutnaSerija }: Props) => {
  const serije = (prosli?.sets ?? [])
    .filter((s) => s.reps != null || Number(s.weight_kg ?? 0) > 0)
    .sort((a, b) => a.set_number - b.set_number);
  if (!serije.length) return null;
  const kada = kadaTekst(prosli?.performed_at ?? null);

  return (
    <div className="rounded-2xl bg-surface border border-hairline px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <History className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
        <span className="font-semibold text-foreground">Prošli put</span>
        {kada && <span>· {kada}</span>}
        <span>
          · {serije.length} {serijeRec(serije.length)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {serije.map((s) => {
          const tren = s.set_number === trenutnaSerija;
          return (
            <span
              key={s.set_number}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-semibold tnum",
                tren
                  ? "border-primary/50 bg-primary-soft/40 text-primary"
                  : "border-hairline bg-surface-2 text-foreground",
              )}
            >
              <span className={cn("text-[10.5px] font-bold", tren ? "text-primary/70" : "text-muted-foreground")}>
                {s.set_number}
              </span>
              {serijaTekst(s.reps, s.weight_kg)}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default ProsliPutTraka;
