import { Activity, Camera, ChevronDown, Dumbbell, Ruler, type LucideIcon } from "lucide-react";

export const ID_DELOVA = {
  treninzi: "vezbac-treninzi",
  merenja: "vezbac-merenja",
  zdravlje: "vezbac-zdravlje",
  fotografije: "vezbac-fotografije",
} as const;

const treninga = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "trening" : "treninga"}`;

/** Grupa "Napredak" sa telefona: cetiri vidljiva ulaza koja vode do svog dela profila. */
export const NapredakPrecice = ({ stats }: { stats: any | null }) => {
  const imaBrojke = stats && stats.success !== false && stats.total_workouts != null;
  const delovi: { id: string; naslov: string; opis: string; Ikona: LucideIcon }[] = [
    {
      id: ID_DELOVA.treninzi,
      naslov: "Treninzi",
      opis: imaBrojke
        ? `${treninga(stats.total_workouts)} ukupno · ${stats.workouts_this_month ?? 0} ovog meseca`
        : "Istorija i statistika",
      Ikona: Dumbbell,
    },
    { id: ID_DELOVA.merenja, naslov: "Merenja", opis: "Težina, obimi i masti", Ikona: Ruler },
    { id: ID_DELOVA.zdravlje, naslov: "Zdravlje", opis: "Puls, koraci, san i kalorije", Ikona: Activity },
    { id: ID_DELOVA.fotografije, naslov: "Fotografije", opis: "Pre i posle", Ikona: Camera },
  ];

  return (
    <nav aria-label="Napredak" className="space-y-2">
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Napredak</h2>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {delovi.map(({ id, naslov, opis, Ikona }) => (
          <button
            key={id}
            type="button"
            onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="card-premium flex items-center gap-3 p-3.5 text-left transition hover:bg-surface-2"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
              <Ikona className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold leading-tight">{naslov}</span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{opis}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </nav>
  );
};
