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
          // Lebdi IZNAD donje navigacije (ona je fixed, z-30, ~67px + mb-3), sa
          // dovoljnim odmakom da se ne dodiruju. Violet tinta, da se ne cita kao
          // jos jedna kartica u sadrzaju.
          className="fixed left-1/2 z-40 w-[calc(100%-32px)] max-w-[400px] -translate-x-1/2
                     inline-flex items-center gap-2.5 rounded-2xl border border-primary/20
                     bg-primary-soft/95 px-3.5 py-2.5 shadow-large backdrop-blur-xl
                     active:scale-[0.99] transition"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 100px)" }}
        >
          <Lock className="h-4 w-4 flex-none text-primary" strokeWidth={2.5} />
          <span className="min-w-0 flex-1 text-left text-[12.5px] font-semibold leading-tight text-primary-soft-foreground">
            Nemaš aktivnu pretplatu - izmene su zaključane
          </span>
        </button>
      )}

      <PretplataLockSheet open={open} onOpenChange={setOpen} fact={fact} />
    </PretplataLockContext.Provider>
  );
};

export default PretplataLockProvider;
