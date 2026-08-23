import { Link2 } from "lucide-react";

/**
 * Traka iznad vezbe koja kaze da je vezba u superset krugu.
 *
 * Bez nje vezbac zavrsi seriju, ne dobije odbrojavanje i ne zna zasto - izostanak
 * pauze izgleda kao kvar. Zato tekst imenuje i vezbu koja ide odmah zatim.
 *
 * Deljena izmedju planiranog i slobodnog treninga: slobodan trening sme da dobije
 * vezbe (trener mu ih doda usred treninga), pa sme da dobije i krug, i mora da ga
 * pokazuje isto.
 */
export const SupersetHint = ({
  supersetGroup,
  sledecaUKrugu,
}: {
  /** NULL = obicna vezba, nista se ne crta. */
  supersetGroup: number | null | undefined;
  /** Naziv sledece vezbe u ISTOM krugu, ili null ako je ova poslednja u krugu. */
  sledecaUKrugu: string | null;
}) => {
  if (supersetGroup == null) return null;
  return (
    <div className="rounded-xl bg-primary-soft px-3 py-2 flex items-center gap-2">
      <Link2 className="h-3.5 w-3.5 text-primary shrink-0" strokeWidth={2.6} />
      <span className="text-[12.5px] text-primary-soft-foreground">
        {sledecaUKrugu ? (
          <>
            Superset - bez pauze, odmah zatim{" "}
            <span className="font-semibold">{sledecaUKrugu}</span>
          </>
        ) : (
          "Superset - posle ove vežbe ide pauza"
        )}
      </span>
    </div>
  );
};

export default SupersetHint;
