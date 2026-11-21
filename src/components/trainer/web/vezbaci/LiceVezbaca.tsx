import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const inicijali = (ime: string) => {
  const delovi = ime.trim().split(/\s+/);
  return ((delovi[0]?.[0] ?? "") + (delovi[1]?.[0] ?? "")).toUpperCase();
};

/** Slika vezbaca; bez slike (ili kad ne moze da se ucita) njegovi inicijali. */
export const LiceVezbaca = ({
  ime,
  slika,
  velicina = 38,
  className,
}: {
  ime: string;
  slika: string | null;
  velicina?: number;
  className?: string;
}) => {
  const [pala, setPala] = useState(false);
  useEffect(() => setPala(false), [slika]);

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-brand font-bold text-white",
        className,
      )}
      style={{ width: velicina, height: velicina, fontSize: Math.round(velicina * 0.32) }}
    >
      {slika && !pala ? (
        <img
          src={slika}
          alt=""
          loading="lazy"
          onError={() => setPala(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        inicijali(ime)
      )}
    </span>
  );
};
