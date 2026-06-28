import { createContext, ReactNode, useCallback, useState } from "react";
import { useMembershipAccess } from "@/hooks/useMembershipAccess";
import { ClanarinaLockSheet } from "./ClanarinaLockSheet";

interface ClanarinaLockCtx {
  hasAccess: boolean;
  openLock: () => void;
}

export const ClanarinaLockContext = createContext<ClanarinaLockCtx>({
  hasAccess: true,
  openLock: () => {},
});

// Deljen za celu vezbac zonu: cita pristup (useMembershipAccess), drzi jedan
// zajednicki lock sheet i izlaze { hasAccess, openLock } kroz context.
export const ClanarinaLockProvider = ({ children }: { children: ReactNode }) => {
  const access = useMembershipAccess();
  const [open, setOpen] = useState(false);
  const openLock = useCallback(() => setOpen(true), []);

  // Dok ucitava -> optimisticno otkljucano (da clanu ne blesne lock). Zakljucaj
  // tek kad RPC potvrdi da nema pristup.
  const hasAccess = access.loading ? true : access.hasAccess;

  return (
    <ClanarinaLockContext.Provider value={{ hasAccess, openLock }}>
      {children}
      <ClanarinaLockSheet
        open={open}
        onOpenChange={setOpen}
        state={access.state}
        endsOn={access.endsOn}
        trainerId={access.trainerId}
        trainerName={access.trainerName}
      />
    </ClanarinaLockContext.Provider>
  );
};

export default ClanarinaLockProvider;
