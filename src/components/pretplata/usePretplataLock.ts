import { useContext } from "react";
import { PretplataLockContext, type ZakljucanKontekst } from "./PretplataLockContext";

// guard(action) vraca onClick handler: ako pretplata postoji pokrene akciju, inace
// otvori sheet sa objasnjenjem. Isti obrazac kao useClanarinaLock na vezbackoj
// strani - zakljucano dugme nikad ne ostaje mrtvo na dodir. Drugi argument je oblast,
// kad radnja ne pripada oblasti trenutne rute (npr. program u profilu vezbaca).
export function usePretplataLock() {
  const { locked, openLock } = useContext(PretplataLockContext);
  const guard = (action: () => void, kontekst?: ZakljucanKontekst) => () => {
    if (locked) openLock(kontekst);
    else action();
  };
  return { locked, openLock, guard };
}
