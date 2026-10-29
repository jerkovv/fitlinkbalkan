import { Link } from "react-router-dom";
import { Activity, ArrowRight, Flame, Heart, Loader2, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { getHrColor, formatDuration } from "@/lib/workout/hrZone";
import { isHrSignalLive, isWatchConnected } from "@/lib/liveWorkout";
import { nazivIzvora } from "@/lib/uredjaji";
import type { ActiveAthlete } from "@/hooks/useActiveAthletes";
import { WatchSlash } from "@/components/trainer/WatchSlash";
import { ZaustaviTreningDugme, jeZaboravljen } from "@/components/trainer/ZaustaviTrening";
import { baterijaVezbaca } from "@/components/trainer/BaterijaVezbaca";
import { BaterijaIkona } from "@/components/wearables/BaterijaIkona";
import { NISKA_BATERIJA } from "@/lib/baterija";

// Pocetna na racunaru: aktivni vezbaci kao spisak u jednoj kartici, kao u Ponoc
// mockupu. Puls i kalorije su blizanci iste velicine u poravnatim kolonama, lice
// nosi prsten u boji zone, a uz svakog stoji uredjaj sa koga puls stize i njegova
// baterija. Podatke daje pocetna (jedan useActiveAthletes za ceo ekran), pa nema
// duplog poll-a ni duplog Realtime kanala.
const MAX_ON_HOME = 5;
// Uzi ekran (do 1279 px): bez kolone uredjaja, da "Trenutno" ne padne na nulu.
const COLS = "grid-cols-[156px_minmax(0,1fr)_60px_64px] xl:grid-cols-[168px_minmax(0,1fr)_64px_70px_124px]";
const KOL_UREDJAJ = "hidden xl:block";
const AKCIJA_KOL = "flex w-[108px] shrink-0 justify-end pr-5";
const KCAL = "#FF8A4C";

export type PodaciUzivo = {
  athletes: ActiveAthlete[];
  now: number;
  loading: boolean;
  ukloni: (sessionId: string) => void;
};

/** Inicijali od imena i prezimena ("Luka Petrovic" -> "LP"), kao u aplikaciji. */
export const inicijali = (ime: string | null) => {
  const delovi = (ime ?? "").trim().split(/\s+/).filter(Boolean);
  if (delovi.length === 0) return "??";
  if (delovi.length === 1) return delovi[0].slice(0, 2).toUpperCase();
  return (delovi[0][0] + delovi[1][0]).toUpperCase();
};

/** Lice sa inicijalima i prstenom u boji zone; odmor je plava znacka pauze. */
export const LiceZone = ({
  ime,
  boja,
  odmor,
  velicina = 34,
}: {
  ime: string | null;
  boja: string | null;
  odmor?: boolean;
  velicina?: number;
}) => (
  <span
    className="relative grid shrink-0 place-items-center rounded-full bg-gradient-brand font-bold text-white"
    style={{
      width: velicina,
      height: velicina,
      fontSize: Math.round(velicina * 0.35),
      boxShadow: `0 0 0 2.5px hsl(var(--card)), 0 0 0 4.5px ${boja ?? "hsl(var(--muted-foreground) / 0.45)"}`,
    }}
  >
    {inicijali(ime)}
    {odmor && (
      <span
        className="absolute -bottom-1.5 -right-1.5 grid h-4 w-4 place-items-center rounded-full"
        style={{ background: "hsl(var(--hr-zone-1))", outline: "2.5px solid hsl(var(--card))" }}
      >
        <Pause className="h-2 w-2 fill-white text-white" />
      </span>
    )}
  </span>
);

/** Brojka sa svojim znakom; puls i kalorije idu kroz ovo da budu iste velicine. */
export const Blizanac = ({
  znak,
  boja,
  vrednost,
  bojaBroja,
}: {
  znak: "puls" | "kcal";
  boja: string;
  vrednost: number | string;
  bojaBroja?: string;
}) => (
  <span className="flex items-baseline gap-1.5" style={{ color: bojaBroja }}>
    {znak === "puls" ? (
      <Heart className="h-[11px] w-[11px] shrink-0 translate-y-px" fill={boja} stroke="none" />
    ) : (
      <Flame className="h-[11px] w-[11px] shrink-0 translate-y-px" fill={boja} stroke="none" />
    )}
    <span className="fig text-[20px] leading-none">{vrednost}</span>
  </span>
);

export const DashboardActiveAthletes = ({ podaci }: { podaci: PodaciUzivo }) => {
  const { athletes, now, loading, ukloni } = podaci;
  const total = athletes.length;
  const visible = athletes.slice(0, MAX_ON_HOME);

  return (
    <section className="card-premium overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="font-display text-[16.5px] font-semibold tracking-tight">Aktivni vežbači</h2>
          {total > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              <span className="text-[11.5px] font-semibold tnum text-success">{total} trenira</span>
            </span>
          )}
        </div>
        {total > 0 && (
          <Link
            to="/trener/uzivo"
            className="inline-flex h-[34px] shrink-0 items-center gap-1 rounded-full border border-white/10 px-3.5 text-[12.5px] font-semibold text-muted-foreground transition hover:text-foreground"
          >
            {total > MAX_ON_HOME ? `Svi (${total})` : "Uživo"}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />
          </Link>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center border-t border-hairline py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : total === 0 ? (
        <div className="border-t border-hairline px-5 py-10 text-center">
          <Activity className="mx-auto mb-2 h-7 w-7 text-muted-foreground/60" strokeWidth={1.5} />
          <div className="text-[13.5px] font-medium">Nijedan vežbač trenutno ne trenira</div>
          <div className="mt-0.5 text-[12px] text-muted-foreground">
            Kad vežbač pokrene trening, pojaviće se ovde uživo.
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center border-y border-hairline bg-white/[0.02] py-2.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            <div className={cn("grid min-w-0 flex-1 gap-3 pl-5", COLS)}>
              <span>Vežbač</span>
              <span>Trenutno</span>
              <span>Puls</span>
              <span>Kcal</span>
              <span className={KOL_UREDJAJ}>Uređaj</span>
            </div>
            <span className={AKCIJA_KOL} aria-hidden="true" />
          </div>
          <ul className="divide-y divide-hairline">
            {visible.map((a) => {
              const elapsed = a.started_at ? now - new Date(a.started_at).getTime() : 0;
              const hrLive = isHrSignalLive(a.hr_last_at, a.watch_last_hr_at, now);
              const boja = hrLive ? getHrColor(a.current_hr) : null;
              // Isto pravilo kao telefon: kcal uz sat uvek, uz traku tek kad procena postoji.
              const showKcal =
                isWatchConnected(a.watch_last_hr_at, now) ||
                (hrLive && (a.current_active_calories ?? 0) > 0);
              const krajOdmora = a.rest_ends_at ? new Date(a.rest_ends_at).getTime() : 0;
              const odmor = a.current_state === "rest" && krajOdmora > now;
              const ostalo = Math.max(0, Math.round((krajOdmora - now) / 1000));
              const zaboravljen = jeZaboravljen(a.started_at, now);
              const uredjaj = nazivIzvora(a.hr_source, a.sensor_name);
              const bat = baterijaVezbaca(a);

              return (
                <li key={a.athlete_id} className="group flex items-center transition hover:bg-white/[0.02]">
                  <Link
                    to={`/trener/vezbac/${a.athlete_id}/live`}
                    className={cn("grid min-w-0 flex-1 items-center gap-3 py-3 pl-5", COLS)}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <LiceZone ime={a.athlete_name} boja={boja} odmor={odmor} />
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-semibold leading-tight">
                          {a.athlete_name ?? "Vežbač"}
                        </span>
                        <span className={cn("block text-[11px] tnum", zaboravljen ? "text-destructive" : "text-success")}>
                          trenira {formatDuration(elapsed)}
                        </span>
                      </span>
                    </span>

                    <span className="min-w-0">
                      <span className={cn("block text-[13px] leading-snug", a.current_exercise_name ? "font-medium" : "text-muted-foreground")}>
                        {a.current_exercise_name ?? "Priprema..."}
                      </span>
                      {a.current_exercise_name && (
                        <span className="text-[11.5px] text-muted-foreground">
                          Serija {a.current_set_number ?? 1}
                          {odmor && (
                            <span
                              className="ml-1.5 inline-flex rounded-full px-1.5 font-semibold tnum"
                              style={{ background: "hsl(var(--hr-zone-1) / 0.14)", color: "hsl(var(--hr-zone-1))" }}
                            >
                              odmor {Math.floor(ostalo / 60)}:{String(ostalo % 60).padStart(2, "0")}
                            </span>
                          )}
                        </span>
                      )}
                    </span>

                    <span>
                      {hrLive ? (
                        <Blizanac znak="puls" boja={boja!} vrednost={a.current_hr ?? "-"} bojaBroja={boja!} />
                      ) : (
                        <WatchSlash size={16} />
                      )}
                    </span>

                    <span>
                      {showKcal ? (
                        <Blizanac znak="kcal" boja={KCAL} vrednost={Math.round(a.current_active_calories ?? 0)} />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </span>

                    <span className={cn("min-w-0 text-[11.5px] text-muted-foreground", KOL_UREDJAJ)}>
                      <span className="block">{uredjaj ?? "Bez uređaja"}</span>
                      {bat && (
                        <span
                          title={`Baterija ${bat.uredjaj === "traka" ? "senzora" : "sata"}: ${bat.pct}%`}
                          className={cn(
                            "mt-0.5 inline-flex items-center gap-1.5 font-semibold tnum",
                            bat.pct <= NISKA_BATERIJA ? "text-warning" : "text-foreground",
                          )}
                        >
                          <BaterijaIkona pct={bat.pct} className="h-3.5 w-3.5" />
                          {bat.pct}%
                        </span>
                      )}
                    </span>
                  </Link>
                  {/* "Zaustavi" se uvek vidi: trener na racunaru ga inace nije nalazio. */}
                  <div className={AKCIJA_KOL}>
                    <ZaustaviTreningDugme
                      sessionId={a.session_id}
                      athleteName={a.athlete_name}
                      onStopped={() => ukloni(a.session_id)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
};

export default DashboardActiveAthletes;
