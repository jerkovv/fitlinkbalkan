import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Apple, ArrowUpRight, CalendarCog, ChevronRight, ClipboardList, Clock, Heart, Hourglass, LayoutGrid, Library, Loader2,
  Package, Share2, Users, Wallet, X,
} from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { Avatar } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import { useActiveAthletes } from "@/hooks/useActiveAthletes";
import { DashboardActiveAthletes } from "./DashboardActiveAthletes";
import { DeoSaMenijem } from "./pocetna/DeoSaMenijem";
import { DugmeVrati, UredjivanjePocetne } from "./pocetna/UredjivanjePocetne";
import { OPIS_DELA, sakrij, vidljivi, type DeoPocetne } from "./pocetna/raspored";
import { useRasporedPocetne } from "./pocetna/useRasporedPocetne";
import { reci, useStudioPregled } from "./pocetna/useStudioPregled";

// Pocetna trenera na racunaru (fitlink.rs/dashboard) u Ponoc stilu: brojke u vrhu
// sa uplatama na cekanju kao istaknutom karticom, spisak uzivo, danasnji raspored,
// a sa strane studio, prihod meseca i plocice "Tvoj studio" sa brojem iza svake
// celine. Telefonska pocetna je ostala u Dashboard.tsx, netaknuta.
//
// Trener slaze pocetnu kao na telefonu (isti zapis na nalogu, vidi pocetna/raspored.ts):
// uplate = istaknuta kartica u vrhu, uzivo i danas = leva kolona po sacuvanom redu,
// programi, ishrana i paketi, termini, objave i biblioteka = plocice po sacuvanom redu,
// ambasadori = desna kolona. Ostale brojke u vrhu, studio i prihod nemaju kljuc na
// telefonu, pa stoje stalno, kao gornji red u aplikaciji.

export type TerminDanas = {
  id: string;
  start_time: string;
  type_name: string;
  type_color: string;
  // null za gosta koga je trener upisao samo po imenu
  athlete_id: string | null;
  athlete_name: string | null;
  status?: string | null;
};

type Props = {
  trainerName: string;
  studio: string;
  activeAthletes: number;
  expiringSoon: number;
  pendingPayments: number;
  sessions: TerminDanas[];
  referrers: { referrer_id: string; referrer_name: string | null; referred_count: number; referred_active: number }[];
  loading: boolean;
  danasNaslov: string;
};

const rsd = (n: number) => Math.round(n).toLocaleString("sr-RS");
const fmtTime = (t: string) => t.slice(0, 5);

/** Isto stanje termina kao na telefonu: Odrzano, Pocelo, za N min, Zakazano. */
function stanjeTermina(t: TerminDanas, sad: Date) {
  if (t.status === "attended") return "Održano";
  const [h, m] = t.start_time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "Zakazano";
  const pocetak = new Date(sad.getFullYear(), sad.getMonth(), sad.getDate(), h, m);
  const min = Math.trunc((pocetak.getTime() - sad.getTime()) / 60000);
  if (min < 0) return "Počelo";
  if (min < 120) return `za ${Math.max(1, min)} min`;
  return "Zakazano";
}

const Praznina = ({ className }: { className?: string }) => (
  <div aria-hidden className={cn("card-premium animate-pulse rounded-[24px] bg-surface", className)} />
);

const Plocica = ({
  to,
  naslov,
  Ikona,
  broj,
  rec,
  opis,
  drugiOpis,
  ucitano,
  istaknuta = false,
}: {
  to: string;
  naslov: string;
  Ikona: typeof Users;
  broj: number | null;
  rec: string;
  opis: string | null;
  drugiOpis?: string | null;
  ucitano: boolean;
  istaknuta?: boolean;
}) => (
  <Link
    to={to}
    className={cn(
      "flex h-full min-w-0 flex-col rounded-2xl border p-3 transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      istaknuta ? "border-transparent bg-gradient-brand-soft shadow-[inset_0_0_0_1px_hsl(262_100%_82%/0.28)]" : "border-hairline bg-white/[0.02]",
    )}
  >
    <span className="flex items-center justify-between gap-1.5 text-[12px] font-semibold text-muted-foreground">
      {naslov}
      <Ikona className="h-3.5 w-3.5 shrink-0 text-primary-soft-foreground" strokeWidth={1.9} />
    </span>
    {ucitano ? (
      <span className="mt-1.5 flex items-baseline gap-1">
        <span className="fig text-[24px] leading-none">{broj ?? "-"}</span>
        <span className="text-[10.5px] font-medium text-muted-foreground">{rec}</span>
      </span>
    ) : (
      <span className="mt-1.5 h-6 w-9 animate-pulse rounded-md bg-surface-2" />
    )}
    {ucitano && opis && <span className="mt-1 break-words text-[10.5px] font-medium leading-snug">{opis}</span>}
    {ucitano && drugiOpis && <span className="text-[10px] leading-snug text-muted-foreground">{drugiOpis}</span>}
  </Link>
);

const RedPlocica = ({ to, naslov, opis, Ikona }: { to: string; naslov: string; opis: string; Ikona: typeof Users }) => (
  <Link
    to={to}
    className="flex items-center gap-2.5 rounded-2xl border border-hairline bg-white/[0.02] p-2.5 transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
  >
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-brand text-white">
      <Ikona className="h-4 w-4" strokeWidth={2} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[12.5px] font-semibold leading-tight">{naslov}</span>
      <span className="mt-0.5 block text-[10.5px] leading-snug text-muted-foreground">{opis}</span>
    </span>
    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  </Link>
);

const SESSION_COLS = "grid-cols-[76px_minmax(0,1.2fr)_minmax(0,1fr)_104px]";

export const DashboardDesktop = (p: Props) => {
  const live = useActiveAthletes();
  const d = useStudioPregled();
  const rsp = useRasporedPocetne();
  const r = rsp.raspored;
  const [uredjuje, setUredjuje] = useState(false);
  const [otvara, setOtvara] = useState(false);
  const brojUzivo = live.athletes.length;

  // Stanje termina ("za 12 min") prati sat dok je pocetna otvorena.
  const [sad, setSad] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setSad(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const ovaj = d?.meseci?.[5]?.iznos ?? 0;
  const prosli = d?.meseci?.[4]?.iznos ?? 0;
  const rast = prosli > 0 ? Math.round(((ovaj - prosli) / prosli) * 100) : null;
  const najveci = Math.max(1, ...(d?.meseci?.map((m) => m.iznos) ?? [1]));

  const redVidljivih = r ? vidljivi(r) : [];
  const vidi = (x: DeoPocetne) => redVidljivih.includes(x);

  const otvoriUredjivanje = async () => {
    if (otvara) return;
    setOtvara(true);
    const moze = await rsp.pripremiUredjivanje();
    setOtvara(false);
    if (!moze) return;
    rsp.zatvoriSavet();
    rsp.postaviUredjuje(true);
    setUredjuje(true);
  };

  const gotovo = () => {
    rsp.postaviUredjuje(false);
    setUredjuje(false);
    rsp.zavrsiIzmene();
  };

  const saMenijem = (deo: DeoPocetne, sadrzaj: ReactNode, className?: string) => (
    <DeoSaMenijem
      key={deo}
      naziv={OPIS_DELA[deo].naziv}
      className={className}
      onSakrij={() => rsp.izmeni((x) => sakrij(x, deo))}
      onUredi={() => void otvoriUredjivanje()}
    >
      {sadrzaj}
    </DeoSaMenijem>
  );

  if (uredjuje && r) {
    return (
      <PhoneShell
        eyebrow="Početna"
        title="Uređuješ početnu"
        action={
          <>
            <DugmeVrati raspored={r} izmeni={rsp.izmeni} />
            <button
              type="button"
              onClick={gotovo}
              className="inline-flex h-9 items-center rounded-full bg-gradient-brand px-[18px] text-[14px] font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Gotovo
            </button>
          </>
        }
      >
        <UredjivanjePocetne raspored={r} izmeni={rsp.izmeni} />
      </PhoneShell>
    );
  }

  const kpi = (
    to: string,
    oznaka: string,
    Ikona: typeof Users,
    vrednost: number,
    opis: string,
    boja: string,
    ikonaStil?: string,
  ) => (
    <Link key={oznaka} to={to} className="card-premium-hover flex flex-col rounded-[24px] p-[18px] pb-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{oznaka}</span>
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground", ikonaStil)}>
          <Ikona className="h-[18px] w-[18px]" strokeWidth={1.9} />
        </span>
      </div>
      {p.loading ? (
        <span className="mt-3 h-[38px] w-14 animate-pulse rounded-lg bg-surface-2" />
      ) : (
        <span className={cn("fig mt-3 text-[38px] leading-none", boja)}>{vrednost}</span>
      )}
      <span className="mt-1.5 text-[12.5px] text-muted-foreground">{opis}</span>
    </Link>
  );

  const karticaUplata = (
    <Link
      to="/trener/uplate"
      className="relative flex h-full flex-col overflow-hidden rounded-[24px] bg-gradient-brand p-[18px] pb-4 text-white shadow-[0_24px_44px_-20px_hsl(267_81%_58%/0.85),inset_0_0_0_1px_hsl(0_0%_100%/0.18)]"
    >
      <span aria-hidden className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/15 blur-[30px]" />
      <div className="relative flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/85">Uplate na čekanju</span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-background text-white">
          <Wallet className="h-[18px] w-[18px]" strokeWidth={1.9} />
        </span>
      </div>
      <div className="relative mt-3 flex items-center gap-2.5">
        <span className="fig text-[38px] leading-none">{p.loading ? "-" : p.pendingPayments}</span>
        {(d?.naCekanjuRsd ?? 0) > 0 && (
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-[12.5px] font-semibold tnum">{rsd(d!.naCekanjuRsd!)} RSD</span>
        )}
      </div>
      <span className="relative mt-1.5 text-[12.5px] text-white/85">zahtevi za članarinu</span>
    </Link>
  );

  const sekcijaDanas = (
    <section className="card-premium overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-display text-[16.5px] font-semibold tracking-tight">Današnji raspored</h2>
          <div className="text-[12px] text-muted-foreground">{p.danasNaslov}</div>
        </div>
        <Link
          to="/trener/kalendar"
          className="inline-flex h-[34px] items-center gap-1 rounded-full border border-white/10 px-3.5 text-[12.5px] font-semibold text-muted-foreground transition hover:text-foreground"
        >
          Kalendar
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      {p.loading ? (
        <div className="border-t border-hairline px-5 py-10 text-center text-[13px] text-muted-foreground">Učitavanje…</div>
      ) : p.sessions.length === 0 ? (
        <div className="border-t border-hairline px-5 py-10 text-center">
          <div className="text-[13.5px] font-medium">Danas nema zakazanih treninga</div>
          <div className="mt-0.5 text-[12px] text-muted-foreground">Vežbači mogu da rezervišu termine iz kalendara</div>
        </div>
      ) : (
        <>
          <div className={cn("grid gap-4 border-y border-hairline bg-white/[0.02] px-5 py-2.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70", SESSION_COLS)}>
            <span>Vreme</span>
            <span>Vežbač</span>
            <span>Trening</span>
            <span className="text-right">Status</span>
          </div>
          <ul className="divide-y divide-hairline">
            {p.sessions.map((s) => {
              const red = cn("grid items-center gap-4 px-5 py-3", SESSION_COLS);
              const sadrzaj = (
                <>
                  <span className="fig text-[15px]">{fmtTime(s.start_time)}</span>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar initials={(s.athlete_name ?? "??").slice(0, 2).toUpperCase()} tone="brand" size="sm" className="ring-0" />
                    <span className="truncate text-[13.5px] font-semibold">{s.athlete_name}</span>
                    {!s.athlete_id && (
                      <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">Gost</span>
                    )}
                  </span>
                  <span className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: bojaTermina(s.type_color) }} />
                    {s.type_name}
                  </span>
                  <span className="flex justify-end">
                    <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary-soft-foreground">
                      {stanjeTermina(s, sad)}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={s.id}>
                  {/* Gost nema profil, pa ni link. */}
                  {s.athlete_id ? (
                    <Link to={`/trener/vezbaci/${s.athlete_id}`} className={cn(red, "transition hover:bg-white/[0.02]")}>
                      {sadrzaj}
                    </Link>
                  ) : (
                    <div className={red}>{sadrzaj}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );

  const sekcijaAmbasadori = (
    <section className="card-premium overflow-hidden rounded-[26px]">
      <h2 className="px-[18px] pb-2.5 pt-4 font-display text-[14.5px] font-semibold">Tvoji ambasadori</h2>
      <div className="divide-y divide-hairline border-t border-hairline">
        {p.referrers.map((a) => (
          <Link key={a.referrer_id} to={`/trener/vezbaci/${a.referrer_id}`} className="flex items-center gap-3 px-[18px] py-3 transition hover:bg-white/[0.02]">
            <Avatar initials={(a.referrer_name ?? "??").slice(0, 2).toUpperCase()} tone="brand" size="sm" className="ring-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold">{a.referrer_name ?? "Bez imena"}</div>
              <div className="text-[11px] text-muted-foreground">
                Doveo {a.referred_count} vežbača
                {a.referred_active > 0 && ` · ${a.referred_active} aktivnih`}
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-bold text-success">
              <Heart className="h-3 w-3 fill-current" />+{a.referred_count}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );

  // Plocice "Tvoj studio": Vezbaci i Uplate nemaju kljuc, ostale idu po sacuvanom redu.
  // Red u punoj sirini ne sme da ostavi rupu, pa neparna plocica ispred njega se siri.
  type Stavka = { kljuc: string; deo: DeoPocetne | null; puna: boolean; sadrzaj: ReactNode };
  const ucitano = d !== null;
  const stavkeStudija: Stavka[] = [
    {
      kljuc: "vezbaci",
      deo: null,
      puna: false,
      sadrzaj: (
        <Plocica to="/trener/vezbaci" naslov="Vežbači" Ikona={Users} broj={d?.vezbaca ?? null} rec={reci.vezbaca(d?.vezbaca ?? 0)}
          opis={d?.pozivnica != null ? reci.pozivnice(d.pozivnica) : null} ucitano={ucitano} />
      ),
    },
    {
      kljuc: "uplate-plocica",
      deo: null,
      puna: false,
      sadrzaj: (
        <Plocica to="/trener/uplate" naslov="Uplate" Ikona={Wallet} broj={p.loading ? null : p.pendingPayments} rec="na čekanju"
          opis={(d?.naCekanjuRsd ?? 0) > 0 ? `${rsd(d!.naCekanjuRsd!)} RSD čeka` : d?.meseci ? `Ovaj mesec ${rsd(ovaj)} RSD` : null}
          ucitano={ucitano && !p.loading} istaknuta={p.pendingPayments > 0} />
      ),
    },
    ...redVidljivih.flatMap((x): Stavka[] => {
      switch (x) {
        case "programi":
          return [{
            kljuc: x, deo: x, puna: false,
            sadrzaj: (
              <Plocica to="/trener/programi" naslov="Programi" Ikona={ClipboardList} broj={d?.programa ?? null} rec={reci.programa(d?.programa ?? 0)}
                opis={d?.poslednjiProgram ?? (d?.programa === 0 ? "Napravi prvi program" : null)} drugiOpis={d?.opisPrograma} ucitano={ucitano} />
            ),
          }];
        case "ishranaPaketi":
          return [
            {
              kljuc: "ishrana", deo: x, puna: false,
              sadrzaj: (
                <Plocica to="/trener/ishrana" naslov="Ishrana" Ikona={Apple} broj={d?.planova ?? null} rec={reci.plana(d?.planova ?? 0)}
                  opis={d?.poslednjiPlan ?? (d?.planova === 0 ? "Napravi prvi plan" : null)} drugiOpis={d?.kcal != null ? `${d.kcal} kcal` : null} ucitano={ucitano} />
              ),
            },
            {
              kljuc: "paketi", deo: x, puna: false,
              sadrzaj: (
                <Plocica to="/trener/paketi" naslov="Paketi" Ikona={Package} broj={d?.paketa ?? null} rec="aktivna"
                  opis={d?.poTreningu != null ? `od ${rsd(d.poTreningu)} po treningu` : d?.paketa === 0 ? "Napravi prvi paket" : null} ucitano={ucitano} />
              ),
            },
          ];
        case "termini":
          return [{
            kljuc: x, deo: x, puna: false,
            sadrzaj: (
              <Plocica to="/trener/termini" naslov="Termini" Ikona={CalendarCog} broj={d?.terminaNedeljno ?? null} rec="nedeljno"
                opis={d?.mesta != null && d.vrsta != null ? `${d.mesta} mesta · ${d.vrsta} ${reci.vrsta(d.vrsta)}` : null} ucitano={ucitano} />
            ),
          }];
        case "objave":
          return [{
            kljuc: x, deo: x, puna: true,
            sadrzaj: <RedPlocica to="/trener/objave" naslov="Objave" opis="Slike za Instagram iz tvojih podataka" Ikona={Share2} />,
          }];
        case "biblioteka":
          return [{
            kljuc: x, deo: x, puna: true,
            sadrzaj: (
              <RedPlocica to="/trener/biblioteka" naslov="Biblioteka vežbi"
                opis={d?.vezbi != null ? `${rsd(d.vezbi)} vežbi sa snimkom` : "Vežbe sa snimkom"} Ikona={Library} />
            ),
          }];
        default:
          return [];
      }
    }),
  ];
  let polovina = 0;
  const sirokeStavke = new Set<string>();
  stavkeStudija.forEach((x, i) => {
    if (x.puna) {
      polovina = 0;
      return;
    }
    polovina += 1;
    const sledeca = stavkeStudija[i + 1];
    if ((!sledeca || sledeca.puna) && polovina % 2 === 1) sirokeStavke.add(x.kljuc);
  });

  const sekcijaStudio = (
    <section key="studio" className="card-premium rounded-[26px] p-4">
      <h2 className="mx-0.5 mb-2.5 font-display text-[14.5px] font-semibold">Tvoj studio</h2>
      {r ? (
        <div className="grid grid-cols-2 gap-2">
          {stavkeStudija.map((x) => {
            const klasa = x.puna || sirokeStavke.has(x.kljuc) ? "col-span-2" : undefined;
            return x.deo ? (
              <DeoSaMenijem
                key={x.kljuc}
                naziv={OPIS_DELA[x.deo].naziv}
                className={klasa}
                onSakrij={() => rsp.izmeni((y) => sakrij(y, x.deo!))}
                onUredi={() => void otvoriUredjivanje()}
              >
                {x.sadrzaj}
              </DeoSaMenijem>
            ) : (
              <div key={x.kljuc} className={cn("min-w-0", klasa)}>{x.sadrzaj}</div>
            );
          })}
        </div>
      ) : (
        <div aria-hidden className="h-[220px] animate-pulse rounded-2xl bg-surface-2/50" />
      )}
    </section>
  );

  const prikaziAmbasadore = vidi("ambasadori") && p.referrers.length > 0;
  const prviDeoStudija = redVidljivih.findIndex((x) =>
    (["programi", "ishranaPaketi", "termini", "objave", "biblioteka"] as DeoPocetne[]).includes(x),
  );
  const ambasadoriPrvi = prikaziAmbasadore && prviDeoStudija >= 0 && redVidljivih.indexOf("ambasadori") < prviDeoStudija;
  const blokAmbasadori = prikaziAmbasadore ? saMenijem("ambasadori", sekcijaAmbasadori) : null;

  return (
    <PhoneShell
      eyebrow="Dobro došao nazad"
      desktopWidth="wide"
      title={<h1 className="font-display text-[32px] font-bold leading-[1.05] tracking-[-0.03em]">Zdravo, {p.trainerName}</h1>}
      action={
        <Link
          to="/trener/uzivo"
          className="flex items-center gap-3.5 rounded-full border border-success/25 bg-surface py-1.5 pl-4 pr-1.5 shadow-[0_14px_30px_-18px_hsl(154_70%_55%/0.6)]"
        >
          <span className={cn("h-[9px] w-[9px] rounded-full", brojUzivo > 0 ? "bg-success animate-pulse" : "bg-muted-foreground/50")} />
          <span className="text-[13.5px] font-semibold">
            {brojUzivo > 0 ? (
              <>
                <span className="text-success">{brojUzivo}</span> trenira uživo
              </>
            ) : (
              "Niko ne trenira"
            )}
          </span>
          <span className="rounded-full bg-white px-3.5 py-2 text-[11.5px] font-bold tracking-[0.08em] text-background">OTVORI</span>
        </Link>
      }
    >
      {r && !rsp.savetVidjen && (
        <div className="flex items-center gap-2 rounded-[18px] border border-primary/30 bg-primary/[0.08] py-2.5 pl-3 pr-2">
          <button
            type="button"
            onClick={() => void otvoriUredjivanje()}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-gradient-brand text-white">
              <LayoutGrid className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold">
                <span className="text-primary-soft-foreground">Novo: </span>složi početnu po svom
              </span>
              <span className="block text-[11.5px] text-muted-foreground">Ti biraš šta vidiš i kojim redom</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-primary-soft-foreground" />
          </button>
          <button
            type="button"
            onClick={rsp.zatvoriSavet}
            aria-label="Zatvori savet"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className={cn("grid gap-4", r && !vidi("uplate") ? "grid-cols-3" : "grid-cols-4")}>
        {kpi("/trener/vezbaci", "Aktivni članovi", Users, p.activeAthletes, "sa aktivnom članarinom", "text-gradient-brand")}
        {kpi("/trener/vezbaci?filter=uskoro", "Ističu uskoro", Hourglass, p.expiringSoon, "u narednih 14 dana", "text-warning", "bg-warning-soft text-warning")}
        {!r ? <Praznina /> : vidi("uplate") ? saMenijem("uplate", karticaUplata) : null}
        {kpi("/trener/kalendar", "Treninga danas", Clock, p.sessions.length, "zakazanih termina", "text-foreground")}
      </div>

      {/* Uzi ekran (1024 do 1279): desna kolona ide ispod, u dve kolone, da tabela uzivo ima mesta. */}
      <div className="grid grid-cols-1 items-start gap-5 pt-1 xl:grid-cols-[minmax(0,1fr)_284px]">
        <div className="min-w-0 space-y-5">
          {!r ? (
            <>
              <Praznina className="h-[220px]" />
              <Praznina className="h-[220px]" />
            </>
          ) : (
            redVidljivih.map((x) =>
              x === "uzivo"
                ? saMenijem("uzivo", <DashboardActiveAthletes podaci={live} />)
                : x === "danas"
                  ? saMenijem("danas", sekcijaDanas)
                  : null,
            )
          )}

          {r && (
            <button
              type="button"
              onClick={() => void otvoriUredjivanje()}
              disabled={otvara}
              className="flex w-full items-center gap-3 rounded-[22px] border border-dashed border-hairline bg-surface px-3.5 py-3 text-left transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-70"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border border-primary/20 bg-primary/15 text-primary-soft-foreground">
                {otvara ? <Loader2 className="h-4 w-4 animate-spin" /> : <LayoutGrid className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold">Uredi početnu</span>
                <span className="block text-[12px] text-muted-foreground">Izaberi šta vidiš i kojim redom</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          )}
        </div>

        <aside className="grid grid-cols-2 items-start gap-4 xl:block xl:space-y-4">
          <div className="card-premium overflow-hidden rounded-[26px]">
            <div className="flex items-center gap-3 bg-gradient-brand-soft p-[18px]">
              <Avatar initials={(p.studio || "S").slice(0, 2).toUpperCase()} tone="brand" size="md" />
              <div className="min-w-0 flex-1">
                <div className="font-display text-[15.5px] font-bold tracking-tight">{p.studio}</div>
                <div className="text-[11.5px] text-muted-foreground">Tvoj studio</div>
              </div>
            </div>
            <Link to="/trener/profil" className="flex items-center justify-between gap-3 border-t border-hairline px-[18px] py-3 transition hover:bg-white/[0.02]">
              <div>
                <div className="text-[13px] font-semibold">Tvoj profil</div>
                <div className="text-[11px] text-muted-foreground">Studio, kontakt, naplata</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </div>

          <Link to="/trener/finansije" className="card-premium block rounded-[26px] px-[18px] pb-3 pt-4 transition hover:shadow-[0_0_0_1px_hsl(267_81%_58%/0.4)]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Ovaj mesec</span>
              {rast !== null && (
                <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold", rast >= 0 ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive-soft-foreground")}>
                  <ArrowUpRight className={cn("h-3 w-3", rast < 0 && "rotate-90")} strokeWidth={2.6} />
                  {rast >= 0 ? "+" : ""}
                  {rast}%
                </span>
              )}
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="fig text-[28px] leading-none">{d?.meseci ? rsd(ovaj) : "-"}</span>
              <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/70">RSD</span>
            </div>
            <div className="mt-3 flex h-[62px] items-end gap-3">
              {(d?.meseci ?? []).map((m, i) => (
                <div key={m.oznaka + i} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={cn("w-full rounded-[7px]", i === 5 ? "bg-gradient-to-t from-[hsl(244_84%_61%)] via-[hsl(267_81%_58%)] to-[hsl(322_72%_59%)]" : "bg-primary-soft-foreground/20")}
                    style={{ height: Math.max(6, (m.iznos / najveci) * 46) }}
                  />
                  <span className={cn("text-[9px]", i === 5 ? "font-semibold text-foreground" : "text-muted-foreground/70")}>{m.oznaka}</span>
                </div>
              ))}
            </div>
          </Link>

          {ambasadoriPrvi && blokAmbasadori}
          {sekcijaStudio}
          {!ambasadoriPrvi && blokAmbasadori}
        </aside>
      </div>
    </PhoneShell>
  );
};

export default DashboardDesktop;

// Boja vrste termina stize kao ime ("emerald", "amber"...), a ne kao CSS boja. Samo "violet" i
// "indigo" su slucajno i CSS imena, pa su ostale tacke bile prazne.
const IMENA_BOJA = new Set(["violet", "indigo", "emerald", "amber", "rose", "sky"]);
function bojaTermina(boja?: string | null): string | undefined {
  if (!boja) return undefined;
  return IMENA_BOJA.has(boja) ? `hsl(var(--session-${boja}-fg))` : boja;
}
