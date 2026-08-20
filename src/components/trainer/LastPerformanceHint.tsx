import { History, Trophy } from "lucide-react";
import type { LastPerformance } from "@/hooks/useLastPerformance";

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
 * Namerno BEZ datuma: treneru treba kilaza i ponavljanja da odredi danasnji
 * cilj, a "pre 3 dana" samo dodaje sum u red koji se ponavlja uz svaku vezbu.
 * RPC i dalje vraca performed_at (koristi se da se zna da istorija POSTOJI),
 * samo se ne prikazuje.
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
          Prošli put
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
