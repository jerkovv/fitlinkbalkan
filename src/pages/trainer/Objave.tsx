import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeftRight, CalendarCheck, CalendarDays, ChartColumn, CircleCheck, Loader2, Share2, Trophy, Users, X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PhoneShell } from "@/components/PhoneShell";
import { PodeliEditor } from "@/components/trainer/web/podeli/PodeliEditor";
import { PoslednjiRezultati } from "@/components/trainer/web/podeli/PoslednjiRezultati";
import { naslovLista, type SadrzajKartice } from "@/components/trainer/web/podeli/model";
import { ucitajKarticu } from "@/components/trainer/web/podeli/ucitavanje";
import { useAuth } from "@/hooks/useAuth";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { porukaGreske } from "@/lib/errorMessage";
import { cn } from "@/lib/utils";

// "Objave": slike za Instagram na jednom mestu, 1:1 sa TrenerObjave.swift. Dve kartice
// trener pravi odavde, a za kartice jednog klijenta pise gde se nalaze. Izabrana kartica
// zivi u adresi (?kartica=...), pa je drugi ekrani otvaraju obicnim linkom.

const UPUTSTVA: { ikona: LucideIcon; naslov: string; gde: string }[] = [
  { ikona: Trophy, naslov: "Rekord", gde: "Poslednji rekordi, odmah ispod" },
  { ikona: CircleCheck, naslov: "Završen trening", gde: "Poslednji treninzi, odmah ispod" },
  { ikona: CalendarCheck, naslov: "Mesec klijenta", gde: "Profil vežbača, ispod statistike" },
  { ikona: ArrowLeftRight, naslov: "Pre i posle", gde: "Profil vežbača, uz fotografije napretka" },
];

function KarticaIzbora({ ikona: Ikona, naslov, opis, priprema, zauzeto, naKlik }: {
  ikona: LucideIcon;
  naslov: string;
  opis: string;
  priprema: boolean;
  zauzeto: boolean;
  naKlik: () => void;
}): ReactNode {
  return (
    <div className="card-premium flex items-center gap-3.5 rounded-[22px] px-4 py-3.5">
      <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[15px] bg-gradient-brand text-white">
        <Ikona className="h-5 w-5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-semibold">{naslov}</div>
        <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{opis}</div>
      </div>
      <button
        type="button"
        disabled={zauzeto}
        aria-label={`Podeli: ${naslov}`}
        onClick={naKlik}
        className={cn(
          "flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-gradient-brand px-3.5 text-[12px] font-semibold text-white transition active:scale-95",
          "outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-foreground",
          zauzeto && "opacity-45",
        )}
      >
        {priprema ? <Loader2 className="h-3 w-3 animate-spin" /> : <Share2 className="h-3 w-3" strokeWidth={2.4} />}
        Podeli
      </button>
    </div>
  );
}

export default function TrainerObjave() {
  const { user } = useAuth();
  const desktop = useDesktopWeb();
  const [sp, setSp] = useSearchParams();
  const [cilj, setCilj] = useState<{ kljuc: string; sadrzaj: SadrzajKartice } | null>(null);
  const [poruka, setPoruka] = useState<string | null>(null);

  const kartica = sp.get("kartica");
  const vezbac = sp.get("vezbac");
  const datum = sp.get("datum");
  const sesija = sp.get("sesija");
  const obavestenje = sp.get("obavestenje");
  const kljuc = useMemo(
    () => (kartica ? JSON.stringify([kartica, vezbac, datum, sesija, obavestenje]) : null),
    [kartica, vezbac, datum, sesija, obavestenje],
  );
  const uid = user?.id ?? null;

  useEffect(() => {
    if (!kljuc || !kartica || !uid) {
      setCilj(null);
      return;
    }
    let ziv = true;
    setCilj(null);
    setPoruka(null);
    const nazad = () => setSp(new URLSearchParams(), { replace: true });
    ucitajKarticu({ kartica, vezbac, datum, sesija, obavestenje }, uid, (e) => {
      if (ziv) toast.error(porukaGreske(e));
    })
      .then((i) => {
        if (!ziv) return;
        if ("sadrzaj" in i) {
          setCilj({ kljuc, sadrzaj: i.sadrzaj });
        } else {
          setPoruka(i.poruka);
          nazad();
        }
      })
      .catch((e) => {
        if (!ziv) return;
        toast.error(porukaGreske(e));
        nazad();
      });
    return () => {
      ziv = false;
    };
    // setSp menja identitet na svaku promenu adrese; ucitavanje zavisi samo od parametara.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kljuc, uid]);

  const otvoreno = cilj && cilj.kljuc === kljuc ? cilj.sadrzaj : null;
  const priprema = !!kljuc && !otvoreno;

  const otvori = (k: string) => {
    setPoruka(null);
    setSp({ kartica: k });
  };

  if (otvoreno) {
    return (
      <PhoneShell
        eyebrow="Instagram"
        title={naslovLista(otvoreno)}
        desktopWidth="wide"
        action={
          <button
            type="button"
            onClick={() => setSp(new URLSearchParams())}
            className="flex h-10 items-center gap-1.5 rounded-full border border-hairline bg-surface px-4 text-[13px] font-medium text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Zatvori
          </button>
        }
      >
        {/* Nov kljuc za novu karticu: naslov i izbor slike ne prelaze sa prethodne. */}
        <div className={cn(!desktop && "px-6")}>
          <PodeliEditor key={cilj!.kljuc} cilj={otvoreno} />
        </div>
      </PhoneShell>
    );
  }

  const izVeze = priprema && kartica !== "termini" && !(kartica === "mesec" && !vezbac);

  return (
    <PhoneShell title="Objave" eyebrow="Instagram" back="/trener" desktopWidth="wide">
      <p className={cn("text-[13.5px] text-muted-foreground", !desktop && "px-6")}>
        Gotove slike iz tvojih podataka. Izabereš izgled, pa podeliš ili sačuvaš.
      </p>

      <div className={cn("space-y-4", !desktop && "px-6")}>
        {poruka && (
          <div role="status" className="rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning-soft-foreground">
            {poruka}
          </div>
        )}
        {izVeze && (
          <div role="status" className="flex items-center gap-2.5 rounded-2xl border border-hairline bg-surface px-4 py-3 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Pripremam karticu...
          </div>
        )}

        <div className={cn("grid gap-3", desktop && "grid-cols-2")}>
          <KarticaIzbora
            ikona={CalendarDays}
            naslov="Slobodni termini"
            opis="Narednih sedam dana iz tvog kalendara"
            priprema={priprema && kartica === "termini"}
            zauzeto={priprema}
            naKlik={() => otvori("termini")}
          />
          <KarticaIzbora
            ikona={ChartColumn}
            naslov="Moj mesec u brojkama"
            opis="Treninzi, klijenti i rekordi prošlog meseca"
            priprema={priprema && kartica === "mesec" && !vezbac}
            zauzeto={priprema}
            naKlik={() => otvori("mesec")}
          />
        </div>

        <section>
          <h2 className="pb-2.5 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Za jednog klijenta</h2>
          <div className={cn("card-premium rounded-[22px] px-4 py-1", desktop && "grid grid-cols-2 gap-x-8")}>
            {UPUTSTVA.map(({ ikona: Ikona, naslov, gde }, i) => (
              <div
                key={naslov}
                className={cn(
                  "flex items-center gap-3 py-2.5",
                  desktop ? i > 1 && "border-t border-hairline" : i > 0 && "border-t border-hairline",
                )}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-primary-soft text-primary-soft-foreground">
                  <Ikona className="h-4 w-4" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold">{naslov}</div>
                  <div className="text-[12px] leading-snug text-muted-foreground">{gde}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {uid && (
          <PoslednjiRezultati
            uid={uid}
            desktop={desktop}
            zauzeto={priprema}
            otvori={(veza) => {
              setPoruka(null);
              setSp(veza);
            }}
          />
        )}

        <Link
          to="/trener/vezbaci"
          className="flex h-12 items-center justify-center gap-2 rounded-full border border-primary-soft-foreground/50 text-[14px] font-semibold text-primary-soft-foreground transition hover:bg-primary-soft"
        >
          <Users className="h-4 w-4" />
          Otvori vežbače
        </Link>
      </div>
    </PhoneShell>
  );
}
