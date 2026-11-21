import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Download, ImagePlus, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { porukaGreske } from "@/lib/errorMessage";
import { cn } from "@/lib/utils";
import { crtajKarticu, type UlazKartice } from "./kartica";
import { dimenzije, napraviSlike, podeliSlike, preuzmi } from "./izvoz";
import {
  BOJE,
  FORMATI,
  IMENA,
  RASPOREDI,
  SIRINA,
  TEME,
  VISINA,
  brojStrana,
  izvorniNaslov,
  klijentKartice,
  nalogIz,
  pocetniStil,
  potpisPrazan,
  prazanPotpis,
  saNaslovom,
  sacuvajMojStil,
  ucitajMojStil,
  type PotpisKartice,
  type SadrzajKartice,
  type SlikaKartice,
  type StilKartice,
  type Tema,
} from "./model";
import { heroUrl, natpisPutanje, slikaIzBloba, ucitajFontove, ucitajHero } from "./resursi";
import { trenerVezbaca, ucitajPotpis } from "./ucitavanje";

// "Podeli": pregled kartice uz kontrole, tri jezicka (Izgled, Sadrzaj, Potpis) i izvoz
// prave slike. Svaka opcija je ista kao u PodeliView.swift.

const MAKS_NASLOV = 40;
const MAKS_PORUKA = 60;

type Jezicak = "izgled" | "sadrzaj" | "potpis";
const JEZICI: { v: Jezicak; natpis: string }[] = [
  { v: "izgled", natpis: "Izgled" },
  { v: "sadrzaj", natpis: "Sadržaj" },
  { v: "potpis", natpis: "Potpis" },
];

const fokus = "outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-foreground";

function Traka<V extends string>({
  stavke,
  izbor,
  naPromenu,
  oznaka,
  mala = false,
}: {
  stavke: { v: V; natpis: string }[];
  izbor: V;
  naPromenu: (v: V) => void;
  oznaka: string;
  mala?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={oznaka} className="flex rounded-xl bg-white/[0.06] p-[3px]">
      {stavke.map((s) => (
        <button
          key={s.v}
          type="button"
          role="radio"
          aria-checked={izbor === s.v}
          onClick={() => naPromenu(s.v)}
          className={cn(
            "flex-1 rounded-[9px] px-2 text-[13px] transition",
            mala ? "h-[30px]" : "h-9",
            izbor === s.v ? "bg-primary-soft-foreground/20 font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
            fokus,
          )}
        >
          {s.natpis}
        </button>
      ))}
    </div>
  );
}

const Natpis = ({ children }: { children: ReactNode }) => (
  <div className="pb-2 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{children}</div>
);

function Prekidac({ naslov, opis, vrednost, naPromenu }: { naslov: string; opis?: string; vrednost: boolean; naPromenu: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={vrednost}
      onClick={() => naPromenu(!vrednost)}
      className={cn("flex w-full items-center gap-3 rounded-lg py-2.5 text-left", fokus)}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{naslov}</span>
        {opis && <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">{opis}</span>}
      </span>
      <span className={cn("flex h-[26px] w-11 shrink-0 rounded-full p-0.5 transition-colors", vrednost ? "justify-end bg-primary" : "justify-start bg-white/15")}>
        <span className="h-[22px] w-[22px] rounded-full bg-white" />
      </span>
    </button>
  );
}

function Polje({ natpis, vrednost, primer, naPromenu, maks, autoComplete }: {
  natpis: string;
  vrednost: string;
  primer: string;
  naPromenu: (v: string) => void;
  maks?: number;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-muted-foreground">{natpis}</span>
      <input
        value={vrednost}
        maxLength={maks}
        placeholder={primer}
        autoComplete={autoComplete ?? "off"}
        onChange={(e) => naPromenu(e.target.value)}
        className="h-11 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-[14px] outline-none transition placeholder:text-muted-foreground/70 focus:border-primary-soft-foreground/60"
      />
    </label>
  );
}

const pozadinaTeme = (t: Tema, fotoUrl: string): React.CSSProperties => {
  switch (t) {
    case "ponoc": return { background: "radial-gradient(circle at 15% 0%, rgba(139,61,235,.85), transparent 62%), #0B0A10" };
    case "svetla": return { background: "#F3EFE8" };
    case "ugalj": return { background: "radial-gradient(circle at 10% 0%, rgba(215,246,74,.5), transparent 58%), #0A0A0A" };
    default: return {
      backgroundImage: `linear-gradient(transparent 45%, rgba(11,10,16,.85)), url("${fotoUrl}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
};

export function PodeliEditor({ cilj, svoj = false }: { cilj: SadrzajKartice; svoj?: boolean }) {
  const { user } = useAuth();
  const desktop = useDesktopWeb();
  const uid = user?.id ?? null;

  const [stil, setStil] = useState<StilKartice>(() => {
    const s = ucitajMojStil(uid)?.stil ?? pocetniStil();
    // Karusel ide u objavu (4:5), ne u story.
    return brojStrana(cilj) > 1 ? { ...s, format: "objava" } : s;
  });
  const [potpis, setPotpis] = useState<PotpisKartice>(() => (svoj ? prazanPotpis() : ucitajMojStil(uid)?.potpis ?? prazanPotpis()));
  const [jezicak, setJezicak] = useState<Jezicak>("izgled");
  const [naslov, setNaslov] = useState(() => izvorniNaslov(cilj));
  const [strana, setStrana] = useState(0);
  const [foto, setFoto] = useState<SlikaKartice | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [hero, setHero] = useState<SlikaKartice | null>(null);
  const [lice, setLice] = useState<SlikaKartice | null>(null);
  const [zapamti, setZapamti] = useState(true);
  const [oznaciTrenera, setOznaciTrenera] = useState(true);
  const [spremno, setSpremno] = useState(false);
  const [greskaPripreme, setGreskaPripreme] = useState<string | null>(null);
  const [radi, setRadi] = useState<"podeli" | "sacuvaj" | null>(null);
  const [sacuvano, setSacuvano] = useState(false);
  const [pokusaj, setPokusaj] = useState(0);

  const platno = useRef<HTMLCanvasElement>(null);
  const fajl = useRef<HTMLInputElement>(null);

  const n = brojStrana(cilj);
  const jeRekord = cilj.vrsta === "rekord";
  const jeTrening = cilj.vrsta === "trening";
  const imaLiniju = cilj.vrsta === "rekord" && cilj.r.napredak.length >= 3;
  const imaPuls = cilj.vrsta === "trening" && cilj.t.pulsNiz.length > 3;
  const imaPoruku = cilj.vrsta === "rekord" || cilj.vrsta === "termini" || cilj.vrsta === "mesecKlijenta";
  const imaDatum = jeRekord || jeTrening;
  const izvorni = izvorniNaslov(cilj);

  // Pismo, potpis i fotografija stizu pre prvog crtanja: nikad se ne prikazuje poluprazna kartica.
  useEffect(() => {
    if (!uid) return;
    let ziv = true;
    setSpremno(false);
    setGreskaPripreme(null);
    const upozori = (e: unknown) => {
      if (ziv) toast.error(porukaGreske(e));
    };
    (async () => {
      try {
        await ucitajFontove();
        const trenerId = svoj ? await trenerVezbaca(uid) : uid;
        const zapamcen = svoj ? prazanPotpis() : ucitajMojStil(uid)?.potpis ?? prazanPotpis();
        const [p] = await Promise.all([
          trenerId ? ucitajPotpis(trenerId, zapamcen, upozori) : Promise.resolve({ potpis: prazanPotpis(), lice: null }),
          ucitajHero().then((h) => {
            if (ziv) setHero(h);
          }).catch(upozori),
        ]);
        if (!ziv) return;
        // Ono sto je korisnik vec otkucao dok se profil ucitavao ostaje.
        setPotpis((t) => ({
          ime: t.ime || p.potpis.ime,
          instagram: t.instagram || p.potpis.instagram,
          studio: t.studio || p.potpis.studio,
        }));
        setLice(p.lice);
        setSpremno(true);
      } catch (e) {
        if (!ziv) return;
        const poruka = porukaGreske(e);
        setGreskaPripreme(poruka);
        toast.error(poruka);
      }
    })();
    return () => {
      ziv = false;
    };
  }, [uid, svoj, pokusaj]);

  useEffect(() => () => {
    if (fotoUrl) URL.revokeObjectURL(fotoUrl);
  }, [fotoUrl]);

  const potpisNaKartici = svoj && !oznaciTrenera ? prazanPotpis() : potpis;

  const ulaz: UlazKartice | null = useMemo(() => {
    if (!spremno) return null;
    return {
      sadrzaj: saNaslovom(cilj, naslov),
      strana,
      stil,
      potpis: potpisNaKartici,
      svoj,
      foto: foto ?? hero,
      lice: svoj && !oznaciTrenera ? null : lice,
      natpis: natpisPutanje(),
    };
  }, [spremno, cilj, naslov, strana, stil, potpisNaKartici.ime, potpisNaKartici.instagram, potpisNaKartici.studio, svoj, foto, hero, lice, oznaciTrenera]);

  const { w: pikselaW, h: pikselaH } = dimenzije(stil.format);

  useEffect(() => {
    const el = platno.current;
    if (!el || !ulaz) return;
    if (el.width !== pikselaW) el.width = pikselaW;
    if (el.height !== pikselaH) el.height = pikselaH;
    const c = el.getContext("2d", { alpha: false });
    if (!c) return;
    try {
      crtajKarticu(c, ulaz);
    } catch (e) {
      toast.error(porukaGreske(e));
    }
    setSacuvano(false);
  }, [ulaz, pikselaW, pikselaH]);

  const promeni = <K extends keyof StilKartice>(k: K, v: StilKartice[K]) => setStil((s) => ({ ...s, [k]: v }));

  const izaberiSliku = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const s = await slikaIzBloba(f, 2400);
      setFoto(s);
      setFotoUrl(URL.createObjectURL(f));
      promeni("tema", "foto");
    } catch (err) {
      toast.error(porukaGreske(err));
    }
  };

  const zapamtiStil = () => {
    if (!zapamti) return;
    // Vezbac ne menja potpis trenera, pa se pamti samo izgled.
    if (!sacuvajMojStil(stil, svoj ? prazanPotpis() : potpis, uid)) {
      toast.error("Stil nije zapamćen u ovom pregledaču. Slika je ipak napravljena.");
    }
  };

  const izvezi = async (radnja: "podeli" | "sacuvaj") => {
    if (!ulaz || radi) return;
    setRadi(radnja);
    try {
      const slike = await napraviSlike(ulaz);
      zapamtiStil();
      if (radnja === "sacuvaj") {
        await preuzmi(slike);
        setSacuvano(true);
      } else {
        const ishod = await podeliSlike(slike);
        if (ishod === "preuzeto") {
          setSacuvano(true);
          toast.success(slike.length > 1 ? "Ovaj pregledač ne deli slike direktno, pa su sačuvane." : "Ovaj pregledač ne deli slike direktno, pa je slika sačuvana.");
        }
      }
    } catch (e) {
      toast.error(porukaGreske(e));
    } finally {
      setRadi(null);
    }
  };

  const izgled = (
    <>
      <Natpis>Format</Natpis>
      <Traka oznaka="Format" stavke={FORMATI} izbor={stil.format} naPromenu={(v) => promeni("format", v)} />
      <Natpis>Stil</Natpis>
      <div className="grid grid-cols-4 gap-2.5" role="radiogroup" aria-label="Stil">
        {TEME.map((t) => (
          <button
            key={t.v}
            type="button"
            role="radio"
            aria-checked={stil.tema === t.v}
            onClick={() => promeni("tema", t.v)}
            style={pozadinaTeme(t.v, fotoUrl ?? heroUrl)}
            className={cn(
              "relative flex h-[58px] items-end rounded-xl border border-hairline px-2 pb-1.5 text-[11px] font-semibold",
              t.v === "svetla" ? "text-[#17131F]" : "text-white",
              stil.tema === t.v && "ring-2 ring-primary-soft-foreground ring-offset-2 ring-offset-background",
              fokus,
            )}
          >
            {t.natpis}
          </button>
        ))}
      </div>
      {stil.tema === "foto" && (
        <>
          <input ref={fajl} type="file" accept="image/*" className="hidden" onChange={izaberiSliku} aria-label="Slika sa računara" />
          <button
            type="button"
            onClick={() => fajl.current?.click()}
            className={cn("mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary-soft-foreground/45 text-[13.5px] font-semibold text-primary-soft-foreground transition hover:bg-primary-soft", fokus)}
          >
            <ImagePlus className="h-4 w-4" />
            {foto ? "Promeni sliku" : "Izaberi sliku sa računara"}
          </button>
        </>
      )}
      <Natpis>Boja</Natpis>
      <div className="flex items-center gap-3" role="radiogroup" aria-label="Boja">
        {BOJE.map((b, i) => (
          <button
            key={b.a}
            type="button"
            role="radio"
            aria-checked={stil.boja === i}
            aria-label={`Boja ${i + 1}`}
            onClick={() => promeni("boja", i)}
            style={{ background: `linear-gradient(135deg, ${b.a}, ${b.c})` }}
            className={cn("h-8 w-8 rounded-full", stil.boja === i && "ring-2 ring-white ring-offset-2 ring-offset-background", fokus)}
          />
        ))}
      </div>
      <Natpis>Raspored</Natpis>
      <Traka oznaka="Raspored" stavke={RASPOREDI} izbor={stil.raspored} naPromenu={(v) => promeni("raspored", v)} />
    </>
  );

  const sadrzaj = (
    <>
      {izvorni && (
        <div className="pt-3">
          <Polje natpis={jeRekord ? "Naziv vežbe" : "Naslov"} vrednost={naslov} primer={izvorni} maks={MAKS_NASLOV} naPromenu={setNaslov} />
        </div>
      )}
      <div className="mt-2 divide-y divide-hairline">
        {!svoj && klijentKartice(cilj) != null && (
          <div className="flex items-center gap-3 py-2.5">
            <span className="flex-1 text-[14px] font-medium">Ime klijenta</span>
            <div className="w-[200px]">
              <Traka oznaka="Ime klijenta" mala stavke={IMENA} izbor={stil.ime} naPromenu={(v) => promeni("ime", v)} />
            </div>
          </div>
        )}
        {imaDatum && <Prekidac naslov="Datum" vrednost={stil.datum} naPromenu={(v) => promeni("datum", v)} />}
        {imaLiniju && <Prekidac naslov="Linija napretka" vrednost={stil.linija} naPromenu={(v) => promeni("linija", v)} />}
        {imaPuls && <Prekidac naslov="Kriva pulsa" vrednost={stil.puls} naPromenu={(v) => promeni("puls", v)} />}
        {jeTrening && <Prekidac naslov="Spisak vežbi" opis="Koliko stane ispod brojki" vrednost={stil.vezbe} naPromenu={(v) => promeni("vezbe", v)} />}
        {cilj.vrsta === "mesecTrenera" && (
          <Prekidac naslov="Rekordi meseca" opis="Samo na story formatu" vrednost={stil.vezbe} naPromenu={(v) => promeni("vezbe", v)} />
        )}
      </div>
      {imaPoruku && (
        <>
          <Natpis>{jeRekord ? "Tvoja poruka" : "Poziv na kraju"}</Natpis>
          <div className="flex h-12 items-center gap-2 rounded-xl border border-primary-soft-foreground/35 bg-surface-2 px-3.5">
            <input
              value={stil.poruka}
              maxLength={MAKS_PORUKA}
              aria-label={jeRekord ? "Tvoja poruka" : "Poziv na kraju"}
              placeholder={jeRekord ? "Npr. Tri meseca rada" : "Npr. Piši mi za termin"}
              onChange={(e) => promeni("poruka", e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[14px] font-medium italic outline-none placeholder:text-muted-foreground/70"
            />
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{stil.poruka.length} / {MAKS_PORUKA}</span>
          </div>
        </>
      )}
    </>
  );

  const deoPotpis = (
    <>
      {svoj ? (
        <>
          <div className="pt-2">
            <Prekidac
              naslov="Označi trenera"
              opis={potpisPrazan(potpis) ? "Nemaš trenera na nalogu" : [potpis.ime, nalogIz(potpis)].filter(Boolean).join(" · ")}
              vrednost={oznaciTrenera}
              naPromenu={setOznaciTrenera}
            />
          </div>
          <p className="pt-1 text-[12px] text-muted-foreground">Tvoji pratioci vide ko te trenira. Možeš da isključiš za ovu sliku.</p>
        </>
      ) : (
        <div className="space-y-3 pt-3">
          <Polje natpis="Ime na kartici" vrednost={potpis.ime} primer="Ime i prezime" naPromenu={(v) => setPotpis((p) => ({ ...p, ime: v }))} />
          <Polje natpis="Instagram" vrednost={potpis.instagram} primer="@tvoj.nalog" naPromenu={(v) => setPotpis((p) => ({ ...p, instagram: v }))} />
          <Polje natpis="Naziv studija" vrednost={potpis.studio} primer="Nije obavezno" naPromenu={(v) => setPotpis((p) => ({ ...p, studio: v }))} />
        </div>
      )}
      <div className="pt-2">
        <Prekidac naslov="Zapamti kao moj stil" opis="Sledeće kartice izlaze ovako" vrednost={zapamti} naPromenu={setZapamti} />
      </div>
      <p className="pt-1 text-[12px] text-muted-foreground">FitLink znak ostaje mali, u uglu kartice.</p>
    </>
  );

  const strelica = (smer: -1 | 1) => {
    const ugaseno = smer < 0 ? strana === 0 : strana === n - 1;
    const Ikona = smer < 0 ? ChevronLeft : ChevronRight;
    return (
      <button
        type="button"
        disabled={ugaseno}
        aria-label={smer < 0 ? "Prethodna slika" : "Sledeća slika"}
        onClick={() => setStrana((s) => s + smer)}
        className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 transition hover:bg-surface-3 disabled:opacity-30", fokus)}
      >
        <Ikona className="h-4 w-4" />
      </button>
    );
  };

  const odnos = SIRINA / VISINA[stil.format];
  const pregled = (
    <div className={cn("flex flex-col items-center", desktop && "sticky top-4 self-start")}>
      <div className="flex w-full items-center justify-center gap-4">
        {n > 1 && strelica(-1)}
        <div
          className="relative min-w-0 overflow-hidden rounded-2xl border border-white/15 bg-surface shadow-[0_24px_60px_-24px_hsl(267_81%_58%/0.7)]"
          style={{
            aspectRatio: `${SIRINA} / ${VISINA[stil.format]}`,
            width: desktop
              ? `min(100%, 400px, calc((100dvh - 210px) * ${odnos}))`
              : `min(100%, 280px, calc(58dvh * ${odnos}))`,
          }}
        >
          <canvas
            ref={platno}
            width={pikselaW}
            height={pikselaH}
            role="img"
            aria-label="Pregled kartice"
            className={cn("block h-full w-full", !ulaz && "invisible")}
          />
          {!ulaz && !greskaPripreme && (
            <div role="status" aria-label="Pripremam karticu" className="absolute inset-0 grid place-items-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {greskaPripreme && (
            <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-[13.5px] text-muted-foreground">{greskaPripreme}</p>
              <button
                type="button"
                onClick={() => setPokusaj((x) => x + 1)}
                className={cn("rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground", fokus)}
              >
                Pokušaj ponovo
              </button>
            </div>
          )}
        </div>
        {n > 1 && strelica(1)}
      </div>
      <div className="mt-2.5 text-[12px] tabular-nums text-muted-foreground">
        {n > 1 ? `Slika ${strana + 1} od ${n} · ` : ""}{pikselaW} x {pikselaH} px
      </div>
    </div>
  );

  const zauzeto = radi !== null || !ulaz;
  const kontrole = (
    <div className="card-premium min-w-0 rounded-[24px] p-5">
      <Traka<Jezicak> oznaka="Podešavanja kartice" stavke={JEZICI} izbor={jezicak} naPromenu={setJezicak} />
      <div className="min-h-[320px]">
        {jezicak === "izgled" ? izgled : jezicak === "sadrzaj" ? sadrzaj : deoPotpis}
      </div>
      <div className="mt-4 space-y-1 border-t border-hairline pt-4">
        <button
          type="button"
          disabled={zauzeto}
          onClick={() => izvezi("podeli")}
          className={cn("flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-gradient-brand text-[15px] font-bold text-white shadow-brand transition active:scale-[0.99] disabled:opacity-50", fokus)}
        >
          {radi === "podeli" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
          Podeli{n > 1 ? ` ${n} slika` : ""}
        </button>
        <button
          type="button"
          disabled={zauzeto}
          onClick={() => izvezi("sacuvaj")}
          className={cn("flex h-10 w-full items-center justify-center gap-2 rounded-full text-[13.5px] font-medium transition hover:bg-surface-2 disabled:opacity-50", sacuvano ? "text-success" : "text-muted-foreground", fokus)}
        >
          {radi === "sacuvaj" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {sacuvano ? "Sačuvano na računaru" : n > 1 ? `Sačuvaj ${n} slika` : "Sačuvaj sliku"}
        </button>
      </div>
    </div>
  );

  return (
    <div className={cn("gap-6", desktop ? "grid grid-cols-[minmax(0,1fr)_420px] items-start" : "flex flex-col")}>
      {pregled}
      {kontrole}
    </div>
  );
}
