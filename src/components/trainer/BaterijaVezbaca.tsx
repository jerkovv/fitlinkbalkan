import { cn } from "@/lib/utils";
import { BaterijaIkona } from "@/components/wearables/BaterijaIkona";
import { NISKA_BATERIJA, baterijaSesije, baterijaZaPrikaz } from "@/lib/baterija";
import type { ActiveAthlete } from "@/hooks/useActiveAthletes";

type SaBaterijom = Pick<
  ActiveAthlete,
  "started_at" | "sensor_battery" | "sensor_battery_at" | "watch_battery" | "watch_battery_at"
>;

/** Baterija koju spisak prikazuje za vezbaca (traka pa sat), samo iz ovog treninga. */
export const baterijaVezbaca = (a: SaBaterijom) =>
  baterijaZaPrikaz(
    baterijaSesije(a.sensor_battery, a.sensor_battery_at, a.started_at),
    baterijaSesije(a.watch_battery, a.watch_battery_at, a.started_at),
  );

/**
 * Spisak aktivnih vezbaca: ikonica baterije i procenat. Koji je uredjaj pise samo u
 * opisu (hover / citac ekrana), da red ostane cist; niska baterija je narandzasta.
 */
export const BaterijaVezbaca = ({ a, className }: { a: SaBaterijom; className?: string }) => {
  const b = baterijaVezbaca(a);
  if (!b) return null;
  const niska = b.pct <= NISKA_BATERIJA;
  const opis = `Baterija ${b.uredjaj === "traka" ? "trake" : "sata"}: ${b.pct}%`;
  return (
    <span
      title={opis}
      aria-label={opis}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 tnum whitespace-nowrap",
        niska ? "text-warning" : "text-muted-foreground",
        className,
      )}
    >
      <BaterijaIkona pct={b.pct} className="h-3.5 w-3.5" />
      {b.pct}%
    </span>
  );
};

export default BaterijaVezbaca;
