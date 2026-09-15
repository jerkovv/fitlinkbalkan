import { History } from "lucide-react";
import type { LastPerformance } from "@/hooks/useLastPerformance";

const broj = (n: number) => String(n).replace(".", ",");

/** "60 kg × 10"; bez kilaze (sopstvena tezina) "10 reps", bez ponavljanja "60 kg". */
export const serijaTekst = (reps: number | null | undefined, kg: number | null | undefined) => {
  const k = kg != null && Number(kg) > 0 ? `${broj(Number(kg))} kg` : null;
  if (k && reps != null) return `${k} × ${reps}`;
  if (k) return k;
  return reps != null ? `${reps} reps` : "-";
};

// Isti zapis kao trenerov "Prosli put" u builderu: "10 kg x 10".
const cipTekst = (reps: number | null, kg: number | null) => {
  const k = kg != null && Number(kg) > 0 ? `${broj(Number(kg))} kg` : null;
  if (k && reps != null) return `${k} x ${reps}`;
  if (k) return k;
  return reps != null ? `${reps} reps` : "-";
};

// 1 serija, 2-4 serije, 5+ serija (21 serija, 22 serije).
const serijeRec = (n: number) => {
  const j = n % 10;
  const d = n % 100;
  return j >= 2 && j <= 4 && !(d >= 12 && d <= 14) ? "serije" : "serija";
};

type Props = {
  prosli: LastPerformance | undefined;
  /** Koliko serija je danas u planu - kad se razlikuje od proslog puta, to pise. */
  serijaDanas: number;
};

/**
 * Prosli trening za ovu vezbu, u istom fazonu kao trenerov "Prosli put" u builderu:
 * sitan naslov i serije redom, bez datuma i bez isticanja. Beli okvir ostaje, jer
 * stoji medju ostalim karticama ekrana treninga.
 */
export const ProsliPutTraka = ({ prosli, serijaDanas }: Props) => {
  const serije = (prosli?.sets ?? [])
    .filter((s) => s.reps != null || Number(s.weight_kg ?? 0) > 0)
    .sort((a, b) => a.set_number - b.set_number);
  if (!serije.length) return null;
  const drugiBroj = serijaDanas > 0 && serije.length !== serijaDanas;

  return (
    <div className="rounded-2xl bg-surface border border-hairline px-3.5 py-3">
      <div className="flex items-center gap-1.5 mb-2">
        <History className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={2.2} />
        <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          Prošli put
        </span>
        {/* Npr. prosli put 4 serije, danas u planu 3: da ne izgleda da je jedna visak. */}
        {drugiBroj && (
          <span className="ml-auto text-[11.5px] text-muted-foreground tnum">
            {serije.length} {serijeRec(serije.length)}, danas {serijaDanas}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {serije.map((s) => (
          <span
            key={s.set_number}
            className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-1 text-[13px] font-medium tnum"
          >
            {cipTekst(s.reps, s.weight_kg)}
          </span>
        ))}
      </div>
    </div>
  );
};

export default ProsliPutTraka;
