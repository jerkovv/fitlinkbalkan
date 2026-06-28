import { useContext } from "react";
import { ClanarinaLockContext } from "./ClanarinaLockProvider";

// guard(action) vraca onClick handler: ako ima pristup pokrene action, inace
// otvori zajednicki lock sheet. Time se umota bilo koja zakljucana akcija, a
// nijedan zakljucan element ne ostaje mrtav na dodir.
export function useClanarinaLock() {
  const { hasAccess, openLock } = useContext(ClanarinaLockContext);
  const guard = (action: () => void) => () => {
    if (hasAccess) action();
    else openLock();
  };
  return { hasAccess, openLock, guard };
}
