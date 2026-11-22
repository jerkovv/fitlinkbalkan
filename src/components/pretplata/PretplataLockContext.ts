import { createContext, type SyntheticEvent } from "react";
import type { LucideIcon } from "lucide-react";

/** Sta je tacno zakljucano: objasnjenje se pise za tu radnju, a ne opste. */
export interface ZakljucanKontekst {
  ikona?: LucideIcon;
  naslov: string;
  tekst: string;
  slika?: string | null;
  naziv?: string;
  stavke?: string[];
}

export interface PretplataLockCtx {
  /** true = nalog nema aktivnu FitLink pretplatu, izmene su zakljucane. */
  locked: boolean;
  /** Otvara zajednicki sheet sa objasnjenjem. Moze i direktno kao onClick. */
  openLock: (kontekst?: ZakljucanKontekst | SyntheticEvent) => void;
}

// Podrazumevano OTKLJUCANO: komponente van trenerskog dela (i testovi) ne smeju
// da se zakljucaju samo zato sto nisu obavijene providerom.
export const PretplataLockContext = createContext<PretplataLockCtx>({
  locked: false,
  openLock: () => {},
});
