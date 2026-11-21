import { MUSCLE_LABELS } from "@/lib/muscleGroups";
import { faktorRuku } from "@/lib/kgPoRuci";
import { serijaRec } from "./tipSerije";

export type VezbaZaStatistiku = {
  kardio: boolean;
  minuta: number | null;
  misic: string | null;
  poRuci: boolean;
  serije: { reps: string; weight_kg: number | null; rest_seconds: number | null }[];
};

/** "8-10" je 9, "12" je 12; za volumen. */
const ponavljanja = (s: string): number => {
  const brojevi = (s.match(/\d+/g) ?? []).map(Number);
  return brojevi.length ? brojevi.reduce((a, b) => a + b, 0) / brojevi.length : 0;
};

const volumenTekst = (kg: number): string =>
  kg >= 1000
    ? `${(kg / 1000).toFixed(1).replace(/\.0$/, "").replace(".", ",")} t`
    : `${Math.round(kg)} kg`;

// Iste grupe i boje kao traka odnosa u nativnom editoru (GrupaMisica).
const bojaMisica = (m: string): string => {
  if (m === "ledja") return "#8B3DEB";
  if (["kvadriceps", "zadnja_loza", "glutei", "listovi"].includes(m)) return "#8C7DFF";
  if (m === "grudi") return "#E24CA6";
  if (m === "ramena" || m === "vrat") return "#5AC8FA";
  if (["biceps", "triceps", "podlaktice"].includes(m)) return "#FFB547";
  if (m === "core") return "#3DDC97";
  if (m === "kardio") return "#FF6B61";
  return "#8A83A0";
};

const nazivMisica = (m: string): string =>
  MUSCLE_LABELS[m] ?? (m === "celo_telo" ? "Celo telo" : m === "ostalo" ? "Ostalo" : m.charAt(0).toUpperCase() + m.slice(1));

/** Brojke izabranog dana i odnos misica, kao iznad spiska vezbi u nativnom editoru. */
export const StatistikaDana = ({ vezbe }: { vezbe: VezbaZaStatistiku[] }) => {
  let serija = 0;
  let sekundi = 0;
  let kg = 0;
  const poMisicu = new Map<string, number>();
  for (const v of vezbe) {
    if (v.kardio) {
      sekundi += (v.minuta ?? 0) * 60;
      continue;
    }
    const m = v.misic ?? "ostalo";
    poMisicu.set(m, (poMisicu.get(m) ?? 0) + v.serije.length);
    for (const s of v.serije) {
      serija += 1;
      sekundi += 45 + Math.max(s.rest_seconds ?? 90, 0);
      kg += (s.weight_kg ?? 0) * ponavljanja(s.reps) * faktorRuku(v.poRuci);
    }
  }
  const misici = [...poMisicu.entries()].sort((a, b) => b[1] - a[1]);
  const trakaUkupno = misici.slice(0, 4).reduce((z, [, n]) => z + n, 0);

  const polja: [string, string][] = [
    [String(serija), "serija"],
    [`~${Math.round(sekundi / 60)}`, "minuta"],
    [volumenTekst(kg), "volumen"],
  ];

  return (
    <div className="space-y-2 pb-1">
      <div className="grid grid-cols-3 divide-x divide-hairline rounded-[20px] border border-hairline bg-surface py-3">
        {polja.map(([vrednost, natpis], i) => (
          <div key={natpis} className="text-center">
            <div className={`fig text-[24px] leading-none ${i === 2 ? "text-gradient-brand" : ""}`}>{vrednost}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{natpis}</div>
          </div>
        ))}
      </div>
      {misici.length > 0 && trakaUkupno > 0 && (
        <div className="space-y-1.5">
          <div className="flex h-2 gap-[3px]" aria-hidden>
            {misici.slice(0, 4).map(([m, n]) => (
              <i
                key={m}
                className="min-w-1 rounded-full"
                style={{ flexGrow: n, flexBasis: 0, background: bojaMisica(m) }}
              />
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
            {misici.slice(0, 3).map(([m, n]) => (
              <span key={m}>
                {nazivMisica(m)} · {serijaRec(n)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StatistikaDana;
