import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  count: number;
  dayName: string;
  loading: boolean;
  onConfirm: () => void;
  /** Rezim zamene (1:1) - drugi nazivi na dugmetu i u podnaslovu. */
  replaceMode?: boolean;
  /**
   * Ispisi dayName bez prefiksa "Dan:". Za pozive gde se ne bira dan nego se
   * vezbe kace na nesto drugo (upis proslog treninga), gde bi "Dan: ..." lagalo.
   * Namerno NIJE spojeno sa replaceMode - on menja i natpise na dugmetu.
   */
  bareDayName?: boolean;
};

export const SelectionActionBar = ({ count, dayName, loading, onConfirm, replaceMode, bareDayName }: Props) => {
  const disabled = count === 0 || loading;
  return (
    // Neprozirna traka u toku layouta (ne absolute overlay): providan gradijent je
    // presecao poslednji red kartica napola, pa je lista izgledala odsecena.
    <div className="shrink-0 z-10 bg-background border-t border-hairline px-5 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold">
          <span className="text-primary font-bold tnum">{count}</span>{" "}
          <span className="text-foreground">izabrano</span>
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {replaceMode || bareDayName ? dayName || "-" : `Dan: ${dayName || "-"}`}
        </div>
      </div>
      <button
        disabled={disabled}
        onClick={onConfirm}
        className={cn(
          "h-12 rounded-full px-6 font-semibold flex items-center gap-2 transition shrink-0",
          disabled
            ? "bg-surface-2 text-muted-foreground shadow-none"
            : "bg-gradient-brand text-primary-foreground shadow-brand active:scale-[0.98]"
        )}
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <>
            {count === 0
              ? (replaceMode ? "Izaberi vežbu" : "Izaberi vežbe")
              : (replaceMode ? "Zameni" : "Dodaj u trening")}
            {count > 0 && <ArrowRight size={16} />}
          </>
        )}
      </button>
    </div>
  );
};
