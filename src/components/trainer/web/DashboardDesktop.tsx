import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Apple, ArrowUpRight, CalendarCog, ChevronRight, ClipboardList, Clock, Hourglass, Package, Users, Wallet,
} from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { Avatar } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useActiveAthletes } from "@/hooks/useActiveAthletes";
import { DashboardActiveAthletes } from "./DashboardActiveAthletes";

// Pocetna trenera na racunaru (fitlink.rs/dashboard) u Ponoc stilu: brojke u vrhu
// sa uplatama na cekanju kao istaknutom karticom, spisak uzivo, danasnji raspored,
// a sa strane studio, prihod meseca i plocice "Tvoj studio" sa brojem iza svake
// celine. Telefonska pocetna je ostala u Dashboard.tsx, netaknuta.

export type TerminDanas = {
  id: string;
  start_time: string;
  type_name: string;
  type_color: string;
  athlete_id: string;
  athlete_name: string | null;
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

type Dodatno = {
  naCekanjuRsd: number;
  meseci: { oznaka: string; iznos: number }[];
  vezbaca: number;
  programa: number;
  planova: number;
  paketa: number;
  terminaNedeljno: number;
};

const MESECI_KRATKO = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Avg", "Sep", "Okt", "Nov", "Dec"];
const rsd = (n: number) => Math.round(n).toLocaleString("sr-RS");
const fmtTime = (t: string) => t.slice(0, 5);

function useDodatno(): Dodatno | null {
  const { user } = useAuth();
  const [d, setD] = useState<Dodatno | null>(null);
  useEffect(() => {
    if (!user) return;
    let ziv = true;
    (async () => {
      const sad = new Date();
      const od = new Date(sad.getFullYear(), sad.getMonth() - 5, 1);
      const [pend, potv, ath, prog, plan, pak, slot] = await Promise.all([
        supabase.from("membership_purchases").select("price_rsd").eq("trainer_id", user.id).eq("status", "pending"),
        supabase
          .from("membership_purchases")
          .select("price_rsd, decided_at")
          .eq("trainer_id", user.id)
          .eq("status", "confirmed")
          .gte("decided_at", od.toISOString()),
        supabase.from("athletes").select("id", { count: "exact", head: true }).eq("trainer_id", user.id),
        supabase.from("program_templates").select("id", { count: "exact", head: true }),
        supabase.from("nutrition_plan_templates").select("id", { count: "exact", head: true }),
        supabase.from("membership_packages").select("id", { count: "exact", head: true }).eq("trainer_id", user.id).eq("is_active", true),
        supabase.from("session_slot_templates").select("id", { count: "exact", head: true }).eq("trainer_id", user.id).eq("is_active", true),
      ]);
      if (!ziv) return;
      const meseci = Array.from({ length: 6 }, (_, i) => {
        const m = new Date(sad.getFullYear(), sad.getMonth() - 5 + i, 1);
        return { god: m.getFullYear(), mes: m.getMonth(), oznaka: MESECI_KRATKO[m.getMonth()], iznos: 0 };
      });
      for (const r of (potv.data as any[]) ?? []) {
        if (!r.decided_at) continue;
        const dt = new Date(r.decided_at);
        const m = meseci.find((x) => x.god === dt.getFullYear() && x.mes === dt.getMonth());
        if (m) m.iznos += r.price_rsd ?? 0;
      }
      setD({
        naCekanjuRsd: ((pend.data as any[]) ?? []).reduce((s, r) => s + (r.price_rsd ?? 0), 0),
        meseci: meseci.map(({ oznaka, iznos }) => ({ oznaka, iznos })),
        vezbaca: ath.count ?? 0,
        programa: prog.count ?? 0,
        planova: plan.count ?? 0,
        paketa: pak.count ?? 0,
        terminaNedeljno: slot.count ?? 0,
      });
    })();
    return () => {
      ziv = false;
    };
  }, [user]);
  return d;
}

const SESSION_COLS = "grid-cols-[76px_minmax(0,1.2fr)_minmax(0,1fr)_104px]";

export const DashboardDesktop = (p: Props) => {
  const live = useActiveAthletes();
  const d = useDodatno();
  const brojUzivo = live.athletes.length;

  const ovaj = d?.meseci[5]?.iznos ?? 0;
  const prosli = d?.meseci[4]?.iznos ?? 0;
  const rast = prosli > 0 ? Math.round(((ovaj - prosli) / prosli) * 100) : null;
  const najveci = Math.max(1, ...(d?.meseci.map((m) => m.iznos) ?? [1]));

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

  const plocica = (to: string, naslov: string, Ikona: typeof Users, broj: number | string, opis: string, istaknuta = false) => (
    <Link
      key={naslov}
      to={to}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border p-3 transition hover:border-primary/40",
        istaknuta ? "border-transparent bg-gradient-brand-soft shadow-[inset_0_0_0_1px_hsl(262_100%_82%/0.28)]" : "border-hairline bg-white/[0.02]",
      )}
    >
      <span className="flex items-center justify-between gap-1.5 text-[12px] font-semibold text-muted-foreground">
        {naslov}
        <Ikona className="h-3.5 w-3.5 shrink-0 text-primary-soft-foreground" strokeWidth={1.9} />
      </span>
      <span className="fig mt-1.5 text-[24px] leading-none">{broj}</span>
      <span className="mt-1 text-[10.5px] leading-snug text-muted-foreground">{opis}</span>
    </Link>
  );

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
      <div className="grid grid-cols-4 gap-4">
        {kpi("/trener/vezbaci", "Aktivni članovi", Users, p.activeAthletes, "sa aktivnom članarinom", "text-gradient-brand")}
        {kpi("/trener/vezbaci", "Ističu uskoro", Hourglass, p.expiringSoon, "u narednih 14 dana", "text-warning", "bg-warning-soft text-warning")}
        <Link
          to="/trener/uplate"
          className="relative flex flex-col overflow-hidden rounded-[24px] bg-gradient-brand p-[18px] pb-4 text-white shadow-[0_24px_44px_-20px_hsl(267_81%_58%/0.85),inset_0_0_0_1px_hsl(0_0%_100%/0.18)]"
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
              <span className="rounded-full bg-white/20 px-2.5 py-1 text-[12.5px] font-semibold tnum">{rsd(d!.naCekanjuRsd)} RSD</span>
            )}
          </div>
          <span className="relative mt-1.5 text-[12.5px] text-white/85">zahtevi za članarinu</span>
        </Link>
        {kpi("/trener/kalendar", "Treninga danas", Clock, p.sessions.length, "zakazanih termina", "text-foreground")}
      </div>

      {/* Uzi ekran (1024 do 1279): desna kolona ide ispod, u dve kolone, da tabela uzivo ima mesta. */}
      <div className="grid grid-cols-1 items-start gap-5 pt-1 xl:grid-cols-[minmax(0,1fr)_284px]">
        <div className="min-w-0 space-y-5">
          <DashboardActiveAthletes podaci={live} />

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
                  {p.sessions.map((s) => (
                    <li key={s.id}>
                      <Link
                        to={`/trener/vezbaci/${s.athlete_id}`}
                        className={cn("grid items-center gap-4 px-5 py-3 transition hover:bg-white/[0.02]", SESSION_COLS)}
                      >
                        <span className="fig text-[15px]">{fmtTime(s.start_time)}</span>
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Avatar initials={(s.athlete_name ?? "??").slice(0, 2).toUpperCase()} tone="brand" size="sm" className="ring-0" />
                          <span className="text-[13.5px] font-semibold">{s.athlete_name}</span>
                        </span>
                        <span className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.type_color }} />
                          {s.type_name}
                        </span>
                        <span className="flex justify-end">
                          <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary-soft-foreground">Zakazano</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
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
              <span className="fig text-[28px] leading-none">{d ? rsd(ovaj) : "-"}</span>
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

          <section className="card-premium rounded-[26px] p-4">
            <h2 className="mx-0.5 mb-2.5 font-display text-[14.5px] font-semibold">Tvoj studio</h2>
            <div className="grid grid-cols-2 gap-2">
              {plocica("/trener/vezbaci", "Vežbači", Users, d?.vezbaca ?? "-", "na tvom spisku")}
              {plocica("/trener/programi", "Programi", ClipboardList, d?.programa ?? "-", "šablona treninga")}
              {plocica("/trener/ishrana", "Ishrana", Apple, d?.planova ?? "-", "planova ishrane")}
              {plocica("/trener/paketi", "Paketi", Package, d?.paketa ?? "-", "aktivnih paketa")}
              {plocica("/trener/uplate", "Uplate", Wallet, p.pendingPayments, "čekaju potvrdu", p.pendingPayments > 0)}
              {plocica("/trener/termini", "Termini", CalendarCog, d?.terminaNedeljno ?? "-", "nedeljno")}
            </div>
          </section>

          {p.referrers.length > 0 && (
            <section className="card-premium overflow-hidden rounded-[26px]">
              <h2 className="px-[18px] pb-2.5 pt-4 font-display text-[14.5px] font-semibold">Tvoji ambasadori</h2>
              <div className="divide-y divide-hairline border-t border-hairline">
                {p.referrers.map((r) => (
                  <Link key={r.referrer_id} to={`/trener/vezbaci/${r.referrer_id}`} className="flex items-center gap-3 px-[18px] py-3 transition hover:bg-white/[0.02]">
                    <Avatar initials={(r.referrer_name ?? "??").slice(0, 2).toUpperCase()} tone="brand" size="sm" className="ring-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold">{r.referrer_name ?? "Bez imena"}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Doveo {r.referred_count} vežbača
                        {r.referred_active > 0 && ` · ${r.referred_active} aktivnih`}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </PhoneShell>
  );
};

export default DashboardDesktop;
