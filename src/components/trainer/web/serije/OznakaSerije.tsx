import { cn } from "@/lib/utils";
import { tipSerije } from "./tipSerije";

/** Oznaka serije: broj za obicnu, obojeno slovo za seriju sa tipom. */
export const OznakaSerije = ({
  broj,
  tip,
  className,
}: {
  broj: number;
  tip: string | null | undefined;
  className?: string;
}) => {
  const t = tipSerije(tip);
  if (!t) return <span className={cn("tnum", className)}>{broj}</span>;
  return (
    <span
      className={cn("font-bold", t.slovo.length > 1 && "text-[0.82em]", className)}
      style={{ color: t.boja }}
    >
      {t.slovo}
    </span>
  );
};

export default OznakaSerije;
