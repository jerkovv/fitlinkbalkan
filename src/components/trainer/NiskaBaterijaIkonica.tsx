import { BatteryLow } from "lucide-react";
import { cn } from "@/lib/utils";
import { NISKA_BATERIJA } from "@/lib/baterija";

/**
 * Spisak aktivnih vezbaca: mala ikonica samo kad je traka ili sat ispod praga.
 * Pun procenat trener vidi u kartici Puls, ovde bi bio sum.
 */
export const NiskaBaterijaIkonica = ({
  traka,
  sat,
  className,
}: {
  traka: number | null;
  sat: number | null;
  className?: string;
}) => {
  const niske = [
    traka != null && traka <= NISKA_BATERIJA ? `traka ${traka}%` : null,
    sat != null && sat <= NISKA_BATERIJA ? `sat ${sat}%` : null,
  ].filter(Boolean);
  if (!niske.length) return null;
  const opis = `Niska baterija: ${niske.join(", ")}`;
  return (
    <span title={opis} aria-label={opis} className={cn("inline-flex shrink-0 items-center text-warning", className)}>
      <BatteryLow className="h-3.5 w-3.5" strokeWidth={2.4} />
    </span>
  );
};

export default NiskaBaterijaIkonica;
