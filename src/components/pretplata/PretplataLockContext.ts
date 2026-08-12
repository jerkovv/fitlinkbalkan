import { createContext } from "react";

export interface PretplataLockCtx {
  /** true = nalog nema aktivnu FitLink pretplatu, izmene su zakljucane. */
  locked: boolean;
  /** Otvara zajednicki sheet sa objasnjenjem. */
  openLock: () => void;
}

// Podrazumevano OTKLJUCANO: komponente van trenerskog dela (i testovi) ne smeju
// da se zakljucaju samo zato sto nisu obavijene providerom.
export const PretplataLockContext = createContext<PretplataLockCtx>({
  locked: false,
  openLock: () => {},
});
