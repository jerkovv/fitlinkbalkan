import { ArrowUpToLine, CornerDownRight, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Tek dodate vezbe server stavlja na kraj; trener odmah bira gde idu. */
export const GdeIdeNova = ({
  nazivi,
  mozePrvo,
  mozeSledeca,
  disabled,
  onPrvo,
  onSledeca,
  onOstavi,
}: {
  nazivi: string[];
  mozePrvo: boolean;
  mozeSledeca: boolean;
  disabled?: boolean;
  onPrvo: () => void;
  onSledeca: () => void;
  onOstavi: () => void;
}) => {
  const izbor = (t: string, Ikona: LucideIcon, glavno: boolean, akcija: () => void) => (
    <button
      type="button"
      disabled={disabled}
      onClick={akcija}
      className={cn(
        "inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[14px] text-[13px] font-semibold transition disabled:opacity-50",
        glavno ? "bg-gradient-brand text-white shadow-brand" : "bg-surface-2 text-foreground hover:bg-surface-3",
      )}
    >
      <Ikona className="h-3.5 w-3.5 shrink-0" strokeWidth={2.6} />
      {t}
    </button>
  );

  return (
    <div
      className="space-y-3 rounded-[22px] border p-3.5"
      style={{
        background: "linear-gradient(135deg, hsl(267 81% 58% / 0.24), hsl(322 80% 58% / 0.1))",
        borderColor: "hsl(262 100% 82% / 0.35)",
      }}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/20 text-primary-soft-foreground">
          <Sparkles className="h-4 w-4" strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold">
            {nazivi.length === 1 ? "Gde ide nova vežba?" : "Gde idu nove vežbe?"}
          </div>
          <div className="text-[12px] text-muted-foreground">{nazivi.join(", ")}</div>
        </div>
      </div>
      {(mozePrvo || mozeSledeca) && (
        <div className="flex gap-2">
          {mozePrvo && izbor("Na prvo mesto", ArrowUpToLine, true, onPrvo)}
          {mozeSledeca && izbor("Kao sledeća", CornerDownRight, !mozePrvo, onSledeca)}
        </div>
      )}
      <button
        type="button"
        onClick={onOstavi}
        className="h-[34px] w-full rounded-lg text-[12.5px] font-semibold text-muted-foreground transition hover:text-foreground"
      >
        {mozeSledeca ? "Ostavi na kraju" : "U redu, ide sledeća"}
      </button>
    </div>
  );
};

export default GdeIdeNova;
