import { useContext } from "react";
import { PretplataLockContext } from "./PretplataLockContext";

// guard(action) vraca onClick handler: ako pretplata postoji pokrene akciju, inace
// otvori sheet sa objasnjenjem. Isti obrazac kao useClanarinaLock na vezbackoj
// strani - zakljucano dugme nikad ne ostaje mrtvo na dodir.
export function usePretplataLock() {
  const { locked, openLock } = useContext(PretplataLockContext);
  const guard = (action: () => void) => () => {
    if (locked) openLock();
    else action();
  };
  return { locked, openLock, guard };
}
