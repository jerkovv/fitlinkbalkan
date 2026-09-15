import { BatteryFull, BatteryLow, BatteryMedium, BatteryWarning } from "lucide-react";
import { NISKA_BATERIJA } from "@/lib/baterija";

/** Ikonica baterije koja se puni po nivou; na pragu i ispod je upozorenje. */
export const BaterijaIkona = ({
  pct,
  className,
  strokeWidth = 2.2,
}: {
  pct: number;
  className?: string;
  strokeWidth?: number;
}) => {
  const Ikona =
    pct <= NISKA_BATERIJA ? BatteryWarning : pct < 50 ? BatteryLow : pct < 80 ? BatteryMedium : BatteryFull;
  return <Ikona className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
};

export default BaterijaIkona;
