import { History, Trophy } from "lucide-react";
import type { LastPerformance } from "@/hooks/useLastPerformance";

const MESECI = [
  "jan", "feb", "mart", "apr", "maj", "jun",
  "jul", "avg", "sep", "okt", "nov", "dec",
];

function kadaTekst(iso: string): string {
  const d = new Date(iso);
  const danas = new Date();
  const dan = 24 * 60 * 60 * 1000;
  // Poredimo kalendarske dane, ne 24h razmake - trening od sinoc u 23h i danas
  // u 7h nisu "pre 0 dana".
  const razlika = Math.round(
    (new Date(danas.getFullYear(), danas.getMonth(), danas.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / dan,
  );
  if (razlika <= 0) return "danas";
  if (razlika === 1) return "juče";
  if (razlika < 7) return `pre ${razlika} dana`;
  return `${d.getDate()}. ${MESECI[d.getMonth()]}`;
}

/** "40 kg x 10" ili samo "x 10" za vezbe sa sopstvenom tezinom. */
function setTekst(s: { reps: number | null; weight_kg: number | null }): string {
  const kg = s.weight_kg != null && Number(s.weight_kg) > 0 ? `${Number(s.weight_kg)} kg` : null;
  const reps = s.reps != null ? `x ${s.reps}` : null;
  return [kg, reps].filter(Boolean).join(" ") || "-";
}

/**
 * "Prosli put" red - sta je vezbac poslednji put odradio za ovu vezbu.
 * Stoji u builderu iznad polja za ciljeve, da trener upisuje danasnji broj
 * gledajuci u prosli, a ne napamet.
 *
 * Kad vezbac vezbu jos nije radio, komponenta se NE renderuje (vraca null) -
 * prazan red "nema podataka" bi samo trosio prostor na svakoj novoj vezbi.
 */
export const LastPerformanceHint = ({ data }: { data: LastPerformance | undefined }) => {
  if (!data || !data.performed_at || data.sets.length === 0) return null;

  const rekord = data.best_weight_kg != null && Number(data.best_weight_kg) > 0
    ? Number(data.best_weight_kg)
    : null;

  return (
    <div className="mb-2.5 rounded-lg bg-surface-2 px-2.5 py-2">
      <div className="flex items-center gap-1.5 mb-1">
        <History className="h-3 w-3 text-muted-foreground shrink-0" strokeWidth={2.2} />
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          Prošli put · {kadaTekst(data.performed_at)}
        </span>
        {rekord != null && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
            <Trophy className="h-3 w-3 text-warning shrink-0" strokeWidth={2.2} />
            {rekord} kg
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {data.sets.map((s) => (
          <span
            key={s.set_number}
            className="inline-flex items-center rounded-md bg-surface px-1.5 py-0.5 text-[11.5px] font-medium tnum"
          >
            {setTekst(s)}
          </span>
        ))}
      </div>
    </div>
  );
};

export default LastPerformanceHint;
