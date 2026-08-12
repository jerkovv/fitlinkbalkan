import { ReactNode, useCallback, useState } from "react";
import { Lock } from "lucide-react";
import { PretplataLockContext } from "./PretplataLockContext";
import { PretplataLockSheet } from "./PretplataLockSheet";

interface Props {
  locked: boolean;
  /** Neutralna cinjenica iz statusa pretplate; prosledjuje se u sheet. */
  fact: string | null;
  children: ReactNode;
}

// Deljeno za ceo trenerski deo: drzi jedan lock sheet, izlaze { locked, openLock }
// kroz context i - dok je zakljucano - prikazuje stalnu traku iznad donje
// navigacije, da je jasno zasto akcije ne rade.
export const PretplataLockProvider = ({ locked, fact, children }: Props) => {
  const [open, setOpen] = useState(false);
  const openLock = useCallback(() => setOpen(true), []);

  return (
    <PretplataLockContext.Provider value={{ locked, openLock }}>
      {children}

      {locked && (
        <button
          type="button"
          onClick={openLock}
          aria-label="Nemaš aktivnu pretplatu, dodirni za objašnjenje"
          // Iznad donje navigacije (fixed, z-30, visina ~64px + mb-3), da ne
          // prekrije ni tabove ni zaglavlje stranice.
          className="fixed left-1/2 z-40 w-[calc(100%-24px)] max-w-[416px] -translate-x-1/2
                     inline-flex items-center gap-2.5 rounded-2xl border border-hairline
                     bg-surface/95 px-4 py-2.5 shadow-large backdrop-blur-xl
                     active:scale-[0.99] transition"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 76px)" }}
        >
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-xl bg-primary-soft">
            <Lock className="h-3.5 w-3.5 text-primary" strokeWidth={2.4} />
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-[12.5px] font-semibold leading-tight text-foreground">
              Nemaš aktivnu pretplatu
            </span>
            <span className="block truncate text-[11px] leading-tight text-muted-foreground">
              Izmene su zaključane
            </span>
          </span>
        </button>
      )}

      <PretplataLockSheet open={open} onOpenChange={setOpen} fact={fact} />
    </PretplataLockContext.Provider>
  );
};

export default PretplataLockProvider;
