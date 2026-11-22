import type { ReactNode } from "react";
import type { ZakljucanKontekst } from "./PretplataLockContext";
import { useZakljucanaZona } from "./useZakljucanaZona";

type Props = {
  children: ReactNode;
  /** Kad radnja pripada drugoj oblasti nego ruta (npr. program u profilu vezbaca). */
  kontekst?: ZakljucanKontekst;
  /** Bez klase zona ne utice na raspored (display: contents). */
  className?: string;
};

// Omotac oko useZakljucanaZona, za mesta gde nema jednog elementa koji bi primio dogadjaje.
export const ZakljucanaZona = ({ children, kontekst, className }: Props) => {
  const zona = useZakljucanaZona(kontekst);
  return (
    <div {...zona} className={className ?? "contents"}>
      {children}
    </div>
  );
};
