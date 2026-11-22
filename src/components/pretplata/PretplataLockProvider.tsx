import { ReactNode, useCallback, useState } from "react";
import { useLocation } from "react-router-dom";
import { Lock } from "lucide-react";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { adresaPretplate } from "./adresaPretplate";
import { oblastZaPutanju } from "./oblastiZakljucanja";
import { PretplataLockContext, type PretplataLockCtx, type ZakljucanKontekst } from "./PretplataLockContext";
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
  const [kontekst, setKontekst] = useState<ZakljucanKontekst | null>(null);
  const desktop = useDesktopWeb();
  const { pathname } = useLocation();
  const openLock = useCallback<PretplataLockCtx["openLock"]>((k) => {
    // Kao onClick dobija dogadjaj, a ne kontekst.
    setKontekst(k && "naslov" in k ? k : null);
    setOpen(true);
  }, []);

  return (
    <PretplataLockContext.Provider value={{ locked, openLock }}>
      {/* Racunar: mirna traka u toku stranice, ne lebdi preko sadrzaja. */}
      {locked && desktop && (
        <div className="relative mx-auto mb-5 flex max-w-[1120px] items-center gap-3.5 rounded-2xl border border-hairline bg-surface px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft">
            <Lock className="h-4 w-4 text-primary" strokeWidth={2.4} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold">{fact?.replace(/\.$/, "") || "Pretplata nije aktivna"}</p>
            <p className="text-[12.5px] text-muted-foreground">
              Sve možeš da pregledaš. Izmene i snimci vežbi se otključavaju čim izabereš plan.
            </p>
          </div>
          <a
            href={adresaPretplate()}
            className="inline-flex h-10 shrink-0 items-center rounded-xl bg-gradient-brand px-5 text-[13.5px] font-semibold text-white shadow-brand transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Izaberi plan
          </a>
        </div>
      )}

      {children}

      {locked && !desktop && (
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

      <PretplataLockSheet open={open} onOpenChange={setOpen} fact={fact} oblast={oblastZaPutanju(pathname)} kontekst={kontekst} />
    </PretplataLockContext.Provider>
  );
};

export default PretplataLockProvider;
