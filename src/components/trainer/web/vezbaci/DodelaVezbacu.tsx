import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { porukaGreske } from "@/lib/errorMessage";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { LiceVezbaca } from "./LiceVezbaca";

type VezbacZaDodelu = { id: string; full_name: string | null; email: string | null };

const imeVezbaca = (v: VezbacZaDodelu) => v.full_name?.trim() || "Bez imena";

/**
 * Dodela sablona vezbacu na racunaru, kao DodelaVezbacuView na telefonu: pretraga,
 * izbor, pa potvrda. Dodela zamenjuje plan, pa se nikad ne desava na prvi klik.
 * Samu dodelu (i proveru pretplate) radi roditelj kroz onDodeli.
 */
export const DodelaVezbacu = ({
  open,
  onOpenChange,
  naslov,
  podnaslov,
  napomena,
  onDodeli,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  naslov: string;
  podnaslov: string;
  napomena?: string;
  onDodeli: (athleteId: string) => Promise<void>;
}) => {
  const [vezbaci, setVezbaci] = useState<VezbacZaDodelu[] | null>(null);
  const [pala, setPala] = useState(false);
  const [pretraga, setPretraga] = useState("");
  const [izabran, setIzabran] = useState<VezbacZaDodelu | null>(null);
  const [radi, setRadi] = useState(false);

  const ucitaj = useCallback(async () => {
    setPala(false);
    setVezbaci(null);
    const { data, error } = await supabase.rpc("get_my_athletes" as never);
    if (error) {
      setPala(true);
      toast.error(porukaGreske(error));
      return;
    }
    setVezbaci(((data ?? []) as unknown) as VezbacZaDodelu[]);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPretraga("");
    setIzabran(null);
    void ucitaj();
  }, [open, ucitaj]);

  const spisak = useMemo(() => {
    const q = pretraga.trim().toLowerCase();
    if (!vezbaci) return [];
    return q
      ? vezbaci.filter((v) => imeVezbaca(v).toLowerCase().includes(q) || (v.email ?? "").toLowerCase().includes(q))
      : vezbaci;
  }, [vezbaci, pretraga]);

  const potvrdi = async () => {
    if (!izabran || radi) return;
    setRadi(true);
    try {
      await onDodeli(izabran.id);
    } finally {
      setRadi(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!radi) onOpenChange(o); }}>
      <DialogContent className="flex h-[min(640px,80vh)] max-w-md flex-col">
        <DialogHeader>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{podnaslov}</div>
          <DialogTitle className="pr-6 leading-snug">{naslov}</DialogTitle>
          <DialogDescription className={cn(!napomena && "sr-only")}>
            {napomena ?? "Pronađi vežbača, izaberi ga i potvrdi dodelu."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex h-full min-h-0 flex-col gap-3">
          <label className="flex h-11 shrink-0 items-center gap-2.5 rounded-xl border border-hairline bg-surface-2 px-3.5">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={pretraga}
              onChange={(e) => setPretraga(e.target.value)}
              placeholder="Pronađi vežbača..."
              aria-label="Pronađi vežbača"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground/70"
            />
          </label>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {pala ? (
              <div className="py-8 text-center">
                <p className="text-[13px] text-muted-foreground">Vežbači nisu učitani.</p>
                <Button variant="outline" onClick={() => void ucitaj()} className="mt-3 h-9 rounded-full px-4 text-[13px]">
                  Pokušaj ponovo
                </Button>
              </div>
            ) : vezbaci === null ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Učitavanje" />
              </div>
            ) : spisak.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">Nema vežbača.</p>
            ) : (
              <div role="radiogroup" aria-label="Vežbač" className="space-y-1">
                {spisak.map((v) => {
                  const oznacen = izabran?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      role="radio"
                      aria-checked={oznacen}
                      onClick={() => setIzabran(v)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        oznacen ? "border-primary bg-primary-soft" : "border-transparent hover:bg-surface-2",
                      )}
                    >
                      <LiceVezbaca ime={imeVezbaca(v)} slika={null} velicina={38} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold leading-snug [overflow-wrap:anywhere]">{imeVezbaca(v)}</span>
                        {v.email && <span className="block text-[11.5px] text-muted-foreground [overflow-wrap:anywhere]">{v.email}</span>}
                      </span>
                      <span
                        className={cn(
                          "grid h-6 w-6 shrink-0 place-items-center rounded-full border",
                          oznacen ? "border-transparent bg-primary text-primary-foreground" : "border-muted-foreground/40",
                        )}
                      >
                        {oznacen && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {izabran && (
          <DialogFooter>
            <Button
              onClick={() => void potvrdi()}
              disabled={radi}
              className="h-12 w-full rounded-2xl bg-gradient-brand text-white shadow-brand"
            >
              {radi ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Dodeli: {imeVezbaca(izabran).split(/\s+/)[0]}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
