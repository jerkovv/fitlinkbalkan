import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AlertCircle, Paperclip, Send } from "lucide-react";
import { toast } from "sonner";
import { BrandGlyph } from "@/components/BrandMark";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { lunoZaNalog } from "./lunoKlijent";
import { ucitajKontekstPodrske } from "./kontekstPodrske";
import { PodrskaModel, type Stavka } from "./podrskaModel";

const CIPOVI = ["Imam problem", "Pitanje o pretplati", "Predlog"];
const OSVEZAVANJE_MS = 4000;
const PET_MINUTA = 300_000;

const DANI = ["Nedelja", "Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak", "Subota"];
const MESECI = [
  "Januar", "Februar", "Mart", "April", "Maj", "Jun",
  "Jul", "Avgust", "Septembar", "Oktobar", "Novembar", "Decembar",
];

const istiDan = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function nazivDana(d: Date) {
  const sad = new Date();
  if (istiDan(d, sad)) return "Danas";
  const juce = new Date(sad.getFullYear(), sad.getMonth(), sad.getDate() - 1);
  if (istiDan(d, juce)) return "Juče";
  if (d.getFullYear() === sad.getFullYear()) return `${DANI[d.getDay()]}, ${d.getDate()}. ${MESECI[d.getMonth()]}`;
  return `${d.getDate()}. ${MESECI[d.getMonth()]} ${d.getFullYear()}.`;
}

const vreme = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const noviDan = (s: Stavka, pre?: Stavka) => !!s.datum && (!pre?.datum || !istiDan(s.datum, pre.datum));

/** Ista strana u razmaku do 5 minuta: jedan naslov tima i jedno vreme za celu grupu. */
const uGrupi = (s: Stavka, pre?: Stavka) =>
  !!pre &&
  pre.strana === s.strana &&
  pre.stanje !== "palo" &&
  !!pre.datum &&
  !!s.datum &&
  s.datum.getTime() - pre.datum.getTime() < PET_MINUTA &&
  istiDan(pre.datum, s.datum);

function Oblacic({
  s,
  prvaUGrupi,
  saVremenom,
  onPonovi,
}: {
  s: Stavka;
  prvaUGrupi: boolean;
  saVremenom: boolean;
  onPonovi?: () => void;
}) {
  const moja = s.strana === "ja";
  const rep = saVremenom || s.stanje === "palo";
  return (
    <div className={cn("flex", moja ? "justify-end pl-14" : "justify-start pr-14")}>
      <div className={cn("flex min-w-0 max-w-[560px] flex-col gap-1", moja ? "items-end" : "items-start")}>
        <div
          className={cn(
            "flex min-w-0 flex-col gap-[3px] rounded-[20px] px-3.5 pb-2 pt-2.5",
            moja ? "items-end bg-gradient-brand text-white" : "items-start border border-hairline bg-surface text-foreground",
            rep && (moja ? "rounded-br-[6px]" : "rounded-bl-[6px]"),
            s.stanje === "salje" && "opacity-70",
          )}
        >
          {!moja && prvaUGrupi && (
            <span className="text-[11px] font-semibold text-primary-soft-foreground">FitLink podrška</span>
          )}
          <span className="flex min-w-0 items-baseline gap-1.5">
            {s.prilog && <Paperclip className="h-3 w-3 shrink-0 self-center" aria-label="Prilog" />}
            <span className="whitespace-pre-wrap break-words text-[14px] leading-[1.45] [overflow-wrap:anywhere]">
              {s.tekst}
            </span>
          </span>
          {saVremenom && s.stanje !== "palo" && s.datum && (
            <span className={cn("text-[10.5px] tabular-nums", moja ? "text-white/70" : "text-muted-foreground")}>
              {s.stanje === "salje" ? "Šalje se..." : vreme(s.datum)}
            </span>
          )}
        </div>
        {s.stanje === "palo" && (
          <button
            type="button"
            onClick={onPonovi}
            className="inline-flex items-center gap-1.5 rounded-md text-[11.5px] font-medium text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
          >
            <AlertCircle className="h-3 w-3" aria-hidden />
            Nije poslato, dodirni za ponovo
          </button>
        )}
      </div>
    </div>
  );
}

export function PodrskaChat({ saZaglavljem }: { saZaglavljem: boolean }) {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const email = user?.email ?? null;

  const model = useMemo(
    () =>
      uid
        ? new PodrskaModel(
            lunoZaNalog(uid),
            uid,
            () => ucitajKontekstPodrske(uid, email),
            (poruka) => toast.error(poruka),
          )
        : null,
    [uid, email],
  );
  const prazno = useRef({
    stavke: [] as Stavka[],
    pozdrav: null,
    spremno: false,
    greska: null,
    bezVeze: false,
    blokiran: false,
  }).current;
  const st = useSyncExternalStore(model?.pretplati ?? (() => () => {}), model?.snimak ?? (() => prazno));

  const [tekst, setTekst] = useState("");
  const unos = useRef<HTMLTextAreaElement>(null);
  const spisak = useRef<HTMLDivElement>(null);
  const naDnu = useRef(true);

  useEffect(() => {
    if (!model) return;
    void model.otvori();
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void model.osvezi();
    }, OSVEZAVANJE_MS);
    const povratak = () => {
      if (document.visibilityState === "visible") void model.osvezi();
    };
    document.addEventListener("visibilitychange", povratak);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", povratak);
    };
  }, [model]);

  // Nova poruka spusta spisak, osim kad trener cita starije poruke.
  const zadnja = st.stavke[st.stavke.length - 1];
  useLayoutEffect(() => {
    const el = spisak.current;
    if (el && (naDnu.current || zadnja?.stanje === "salje")) el.scrollTop = el.scrollHeight;
  }, [st.stavke.length, st.spremno, zadnja?.stanje]);

  // Polje raste do pet redova.
  useLayoutEffect(() => {
    const el = unos.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 136)}px`;
  }, [tekst]);

  const posalji = () => {
    const t = tekst.trim();
    if (!t || !model) return;
    setTekst("");
    naDnu.current = true;
    void model.posalji(t);
  };

  const naCip = (c: string) => {
    setTekst((x) => (x ? `${x} ${c}` : `${c}: `));
    unos.current?.focus();
  };

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden",
        saZaglavljem ? "card-premium h-[calc(100dvh-120px)] min-h-[480px] rounded-[26px]" : "h-[calc(100dvh-210px)] min-h-[420px]",
      )}
    >
      {saZaglavljem && (
        <header className="flex items-center gap-3 border-b border-hairline px-5 py-3.5">
          <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-gradient-brand" aria-hidden>
            <BrandGlyph className="h-4 text-white" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-[16.5px] font-semibold leading-tight">FitLink podrška</h1>
            <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <span className="h-[7px] w-[7px] rounded-full bg-success" aria-hidden />
              Tim FitLink-a
            </div>
          </div>
        </header>
      )}

      <p className="mx-4 mt-3.5 rounded-[18px] border border-primary/30 bg-primary/10 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
        Pišeš <span className="font-semibold text-foreground">FitLink timu</span>. Odgovor stiže ovde i kao obaveštenje na
        telefon.
      </p>

      <div
        ref={spisak}
        role="log"
        aria-label="Razgovor sa podrškom"
        onScroll={(e) => {
          const el = e.currentTarget;
          naDnu.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-3.5 pt-1.5"
      >
        {st.greska && !st.spremno && (
          <div className="flex flex-col items-center gap-2.5 pt-6 text-center">
            <p className="text-[13px] text-muted-foreground">{st.greska}</p>
            <button
              type="button"
              onClick={() => void model?.otvori()}
              className="h-[38px] rounded-full border border-hairline bg-surface px-4 text-[13px] font-semibold text-primary-soft-foreground transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Pokušaj ponovo
            </button>
          </div>
        )}

        {st.spremno && st.pozdrav && (
          <div className="pt-2">
            <Oblacic
              s={{ id: "pozdrav", strana: "tim", tekst: st.pozdrav, datum: null, prilog: false, stanje: "poslato" }}
              prvaUGrupi
              saVremenom={false}
            />
          </div>
        )}

        {st.stavke.map((s, i) => {
          const pre = st.stavke[i - 1];
          const sledeca = st.stavke[i + 1];
          return (
            <div key={s.id}>
              {noviDan(s, pre) && s.datum && (
                <div className="flex justify-center pb-1 pt-3.5">
                  <span className="inline-flex h-[26px] items-center rounded-full bg-surface px-3 text-[11px] font-semibold text-muted-foreground">
                    {nazivDana(s.datum)}
                  </span>
                </div>
              )}
              {s.strana === "sistem" ? (
                <p className="px-5 pt-2.5 text-center text-[11.5px] text-muted-foreground">{s.tekst}</p>
              ) : (
                <div className={uGrupi(s, pre) ? "pt-[3px]" : "pt-2.5"}>
                  <Oblacic
                    s={s}
                    prvaUGrupi={!uGrupi(s, pre)}
                    saVremenom={sledeca ? !uGrupi(sledeca, s) : true}
                    onPonovi={() => void model?.ponovi(s.id)}
                  />
                </div>
              )}
            </div>
          );
        })}

        {st.bezVeze && st.spremno && (
          <p className="pt-3 text-center text-[11.5px] text-muted-foreground">
            Nema veze. Nove poruke stižu čim se veza vrati.
          </p>
        )}
      </div>

      {st.blokiran ? (
        <p className="px-6 py-[18px] text-center text-[12.5px] text-muted-foreground">
          Slanje poruka podršci trenutno nije moguće.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 px-4 pb-1 pt-1.5">
            {CIPOVI.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => naCip(c)}
                className="h-9 rounded-full border border-white/10 bg-surface/60 px-3.5 text-[13px] text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2.5 px-4 pb-3 pt-2">
            <textarea
              ref={unos}
              rows={1}
              value={tekst}
              onChange={(e) => setTekst(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  posalji();
                }
              }}
              placeholder="Napiši poruku..."
              aria-label="Napiši poruku"
              className="max-h-[136px] min-h-[52px] flex-1 resize-none rounded-[26px] border border-hairline bg-surface px-[18px] py-3.5 text-[15px] leading-[1.45] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
            />
            <button
              type="button"
              onClick={posalji}
              disabled={!tekst.trim()}
              aria-label="Pošalji"
              className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-gradient-brand text-white shadow-[0_8px_22px_-6px_hsl(267_81%_58%/0.7)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-[18px] w-[18px]" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
