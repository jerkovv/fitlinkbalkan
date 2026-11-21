import { useEffect, useState } from "react";
import { CircleCheck, Share2, Trophy, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { porukaGreske } from "@/lib/errorMessage";
import { cn } from "@/lib/utils";
import { datumTekst } from "./model";
import { ucitajPoslednjeRezultate, type PoslednjiRezultat } from "./ucitavanje";

// Na telefonu se rekord i zavrsen trening dele iz obavestenja. Na racunaru su ovde, odmah
// pri ruci: poslednji iz istih obavestenja, jedan klik do kartice.

function Spisak({ naslov, ikona: Ikona, stavke, prazno, zauzeto, otvori }: {
  naslov: string;
  ikona: LucideIcon;
  stavke: PoslednjiRezultat[] | null;
  prazno: string;
  zauzeto: boolean;
  otvori: (veza: Record<string, string>) => void;
}) {
  return (
    <section className="card-premium min-w-0 rounded-[22px] px-4 py-3">
      <h3 className="flex items-center gap-2 pb-2 text-[13.5px] font-semibold">
        <Ikona className="h-4 w-4 text-primary-soft-foreground" strokeWidth={2} />
        {naslov}
      </h3>
      {stavke === null ? (
        <div role="status" aria-label="Učitavanje" className="space-y-2 pb-1">
          {[0, 1, 2].map((i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-surface-2" />)}
        </div>
      ) : stavke.length === 0 ? (
        <p className="pb-2 text-[12.5px] text-muted-foreground">{prazno}</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {stavke.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[13.5px] font-semibold">{s.ime}</span>
                  {s.datum && <span className="shrink-0 text-[11px] text-muted-foreground">{datumTekst(s.datum)}</span>}
                </div>
                <div className="line-clamp-2 text-[12px] leading-snug text-muted-foreground">{s.opis}</div>
              </div>
              <button
                type="button"
                disabled={zauzeto}
                aria-label={`Podeli: ${s.ime}, ${s.opis}`}
                onClick={() => otvori(s.veza)}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-gradient-brand px-3 text-[12px] font-semibold text-white transition active:scale-95",
                  "outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-foreground disabled:opacity-45",
                )}
              >
                <Share2 className="h-3 w-3" strokeWidth={2.4} />
                Podeli
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PoslednjiRezultati({ uid, desktop, zauzeto, otvori }: {
  uid: string;
  desktop: boolean;
  zauzeto: boolean;
  otvori: (veza: Record<string, string>) => void;
}) {
  const [rekordi, setRekordi] = useState<PoslednjiRezultat[] | null>(null);
  const [treninzi, setTreninzi] = useState<PoslednjiRezultat[] | null>(null);
  const [greska, setGreska] = useState(false);
  const [pokusaj, setPokusaj] = useState(0);

  useEffect(() => {
    let ziv = true;
    setGreska(false);
    setRekordi(null);
    setTreninzi(null);
    ucitajPoslednjeRezultate(uid)
      .then((r) => {
        if (!ziv) return;
        setRekordi(r.rekordi);
        setTreninzi(r.treninzi);
      })
      .catch((e) => {
        if (!ziv) return;
        setGreska(true);
        toast.error(porukaGreske(e));
      });
    return () => {
      ziv = false;
    };
  }, [uid, pokusaj]);

  if (greska) {
    return (
      <div role="alert" className="card-premium flex items-center justify-between gap-3 rounded-[22px] px-4 py-3">
        <span className="text-[13px] text-muted-foreground">Poslednji rekordi i treninzi nisu učitani.</span>
        <button
          type="button"
          onClick={() => setPokusaj((x) => x + 1)}
          className="shrink-0 rounded-full border border-hairline px-3.5 py-1.5 text-[12.5px] font-semibold transition hover:bg-surface-2"
        >
          Pokušaj ponovo
        </button>
      </div>
    );
  }

  return (
    <div className={cn("grid items-start gap-3", desktop && "grid-cols-2")}>
      <Spisak naslov="Poslednji rekordi" ikona={Trophy} stavke={rekordi} prazno="Još nema rekorda za deljenje." zauzeto={zauzeto} otvori={otvori} />
      <Spisak naslov="Poslednji treninzi" ikona={CircleCheck} stavke={treninzi} prazno="Još nema završenih treninga za deljenje." zauzeto={zauzeto} otvori={otvori} />
    </div>
  );
}
