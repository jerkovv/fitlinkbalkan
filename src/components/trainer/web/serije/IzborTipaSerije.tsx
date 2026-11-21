import { Check, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { NAZIV_OBICNE, PAROVI, SIROKI, tipSerije, type TipSerijeId } from "./tipSerije";

/**
 * Prozor za izbor tipa serije, isti raspored kao na telefonu: obicna serija, tri
 * siroka reda, parovi, i na dnu uklanjanje serije. Samo za trenera.
 */
export const IzborTipaSerije = ({
  broj,
  tip,
  mozeUkloniti,
  onIzaberi,
  onUkloni,
  onClose,
}: {
  broj: number;
  tip: string | null | undefined;
  /** false kad je serija jedina u vezbi: vezba mora imati bar jednu. */
  mozeUkloniti: boolean;
  onIzaberi: (tip: TipSerijeId | null) => void;
  onUkloni: () => void;
  onClose: () => void;
}) => {
  const trenutni = tipSerije(tip)?.id ?? null;

  const red = (id: TipSerijeId | null) => {
    const t = id ? tipSerije(id) : null;
    const izabran = id === trenutni;
    return (
      <button
        key={id ?? "obicna"}
        type="button"
        aria-pressed={izabran}
        onClick={() => {
          onClose();
          if (!izabran) onIzaberi(id);
        }}
        className={cn(
          "flex h-14 w-full min-w-0 items-center gap-2.5 rounded-[18px] border px-3.5 text-left transition",
          !izabran && "border-hairline bg-surface hover:bg-surface-2",
          izabran && !t && "border-primary/60 bg-primary-soft",
        )}
        style={izabran && t ? { background: `${t.boja}1F`, borderColor: `${t.boja}99` } : undefined}
      >
        <span
          className={cn("w-7 shrink-0 text-center font-bold tnum", t && t.slovo.length > 1 ? "text-[16px]" : "text-[19px]")}
          style={{ color: t?.boja ?? "hsl(var(--muted-foreground))" }}
        >
          {t?.slovo ?? broj}
        </span>
        <span className="min-w-0 flex-1 text-[14px] font-medium leading-tight">{t?.naziv ?? NAZIV_OBICNE}</span>
        {izabran && <Check className="h-4 w-4 shrink-0 text-primary-soft-foreground" strokeWidth={3} />}
      </button>
    );
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[480px] gap-0 rounded-[26px] border-hairline bg-background p-0">
        <DialogHeader className="space-y-1 border-b border-hairline px-5 py-4 text-center sm:text-center">
          <DialogTitle className="text-[17px]">Tip serije</DialogTitle>
          <DialogDescription className="text-[12px]">Serija {broj}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5 p-4">
          {red(null)}
          {SIROKI.map((id) => red(id))}
          {PAROVI.map(([a, b]) => (
            <div key={a} className="grid grid-cols-2 gap-2.5">
              {red(a)}
              {red(b)}
            </div>
          ))}
          <button
            type="button"
            disabled={!mozeUkloniti}
            onClick={() => {
              onClose();
              onUkloni();
            }}
            className="flex h-14 w-full items-center gap-2.5 rounded-[18px] border border-hairline bg-surface px-3.5 text-left transition hover:bg-destructive-soft disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface"
          >
            <span className="grid w-7 shrink-0 place-items-center text-destructive">
              <Trash2 className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </span>
            <span className="text-[14px] font-medium">Ukloni seriju</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default IzborTipaSerije;
