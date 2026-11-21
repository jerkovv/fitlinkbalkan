import { ArrowUpDown, ArrowUpToLine, ChevronDown, ChevronUp, CornerDownRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { blokovi, novRedosled, type Mesto, type VezbaURedu } from "./redosled";

const MESTA = [
  { mesto: "prvo", naziv: "Na prvo mesto", Ikona: ArrowUpToLine },
  { mesto: "sledeca", naziv: "Kao sledeća", Ikona: CornerDownRight },
  { mesto: "gore", naziv: "Pomeri gore", Ikona: ChevronUp },
  { mesto: "dole", naziv: "Pomeri dole", Ikona: ChevronDown },
] as const;

/** Premestanje jedne vezbe (superset ide ceo). Nude se samo potezi koji nesto menjaju. */
export const PomeriMeni = ({
  vezbe,
  vezba,
  tekuca,
  disabled,
  onPremesti,
  onCeoRedosled,
}: {
  vezbe: VezbaURedu[];
  vezba: VezbaURedu;
  tekuca: number;
  disabled?: boolean;
  onPremesti: (mesto: Mesto) => void;
  onCeoRedosled: () => void;
}) => {
  const moguca = MESTA.filter((m) => novRedosled(vezbe, [vezba.id], m.mesto, tekuca) !== null);
  if (moguca.length === 0) return null;
  return (
    // modal={false}: "Ceo redosled" odavde otvara prozor, a modalni meni bi pri
    // zatvaranju ostavio stranicu bez klikova.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-hairline bg-surface-2 px-2.5 text-[12px] font-semibold text-primary-soft-foreground transition hover:border-primary/40 disabled:opacity-50"
        >
          <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={2.4} />
          Pomeri
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[11.5px] font-medium text-muted-foreground">
          {vezba.superset_group != null ? "Superset se pomera ceo" : "Vežbač odmah vidi novi redosled"}
        </DropdownMenuLabel>
        {moguca.map(({ mesto, naziv, Ikona }) => (
          <DropdownMenuItem key={mesto} onSelect={() => onPremesti(mesto)} className="gap-2 text-[13px]">
            <Ikona className="h-4 w-4 text-muted-foreground" strokeWidth={2.2} />
            {naziv}
          </DropdownMenuItem>
        ))}
        {blokovi(vezbe).length > 2 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCeoRedosled} className="gap-2 text-[13px]">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" strokeWidth={2.2} />
              Ceo redosled
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default PomeriMeni;
