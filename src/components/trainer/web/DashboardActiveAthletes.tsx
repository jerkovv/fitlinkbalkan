import { Link } from "react-router-dom";
import { Activity, ArrowRight, Heart, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import { getHrColor, formatDuration } from "@/lib/workout/hrZone";
import { hrSourceLabel, isHrSignalLive, isWatchConnected } from "@/lib/liveWorkout";
import { useActiveAthletes } from "@/hooks/useActiveAthletes";
import { WatchSlash } from "@/components/trainer/WatchSlash";
import { ZaustaviTreningDugme, jeZaboravljen } from "@/components/trainer/ZaustaviTrening";

// Pocetna na racunaru: aktivni vezbaci kao tabela u jednoj kartici. Isti hook i
// ista pravila za puls/kcal kao telefonski ActiveAthletesList; Dashboard montira
// samo jedan od njih, pa nema dupli poll ni dupli realtime kanal.
// Siroka kolona prima vise redova nego telefon (tamo su 3).
const MAX_ON_HOME = 5;
const COLS = "grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_108px_92px]";
// "Zaustavi" stoji van Link-a (dugme u linku nije ispravan HTML), u svojoj koloni.
const AKCIJA_KOL = "flex w-[128px] shrink-0 justify-end pl-4 pr-5";

export const DashboardActiveAthletes = () => {
  const { athletes, now, loading, ukloni } = useActiveAthletes();
  const total = athletes.length;
  const visible = athletes.slice(0, MAX_ON_HOME);

  return (
    <section className="card-premium overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="font-display text-[17px] font-bold tracking-tight">Aktivni vežbači</h2>
          {total > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-[11.5px] font-bold tnum text-success-soft-foreground">
                {total} uživo
              </span>
            </span>
          )}
        </div>
        {total > 0 && (
          <Link
            to="/trener/uzivo"
            className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
          >
            {total > MAX_ON_HOME ? `Pogledaj sve (${total})` : "Uživo pregled"}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
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
          <div className="flex items-center border-y border-hairline bg-surface-2/50 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <div className={cn("grid min-w-0 flex-1 gap-4 pl-5", COLS)}>
              <span>Vežbač</span>
              <span>Trenutno</span>
              <span>Puls</span>
              <span className="text-right">Kcal</span>
            </div>
            <span className={AKCIJA_KOL} aria-hidden="true" />
          </div>
          <ul className="divide-y divide-hairline">
            {visible.map((a) => {
              const elapsed = a.started_at ? now - new Date(a.started_at).getTime() : 0;
              const initials = (a.athlete_name ?? "??").slice(0, 2).toUpperCase();
              const hrLive = isHrSignalLive(a.hr_last_at, a.watch_last_hr_at, now);
              const izvor = hrSourceLabel(a.hr_source);
              // Isto pravilo kao telefon: kcal uz sat uvek, uz traku tek kad procena postoji.
              const showKcal =
                isWatchConnected(a.watch_last_hr_at, now) ||
                (hrLive && (a.current_active_calories ?? 0) > 0);
              const exerciseLabel = a.current_exercise_name
                ? `${a.current_exercise_name} · Serija ${a.current_set_number ?? 1}`
                : "Priprema...";

              return (
                <li key={a.athlete_id} className="flex items-center transition hover:bg-surface-2">
                  <Link
                    to={`/trener/vezbac/${a.athlete_id}/live`}
                    className={cn("grid min-w-0 flex-1 items-center gap-4 py-3 pl-5", COLS)}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="relative shrink-0">
                        <Avatar initials={initials} tone="brand" size="sm" className="ring-0" />
                        <span
                          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-card animate-pulse"
                          aria-label="Aktivan"
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-semibold tracking-tight">
                          {a.athlete_name ?? "Vežbač"}
                        </span>
                        <span
                          className={cn(
                            "block text-[12px] tnum",
                            jeZaboravljen(a.started_at, now) ? "text-destructive" : "text-muted-foreground",
                          )}
                        >
                          trenira {formatDuration(elapsed)}
                        </span>
                      </span>
                    </span>

                    <span className="truncate text-[13px] text-muted-foreground">{exerciseLabel}</span>

                    <span className="flex min-w-0 items-center gap-1.5">
                      {hrLive ? (
                        <>
                          <span
                            className="inline-flex items-center gap-1 font-display text-[16px] font-bold tnum"
                            style={{ color: getHrColor(a.current_hr) }}
                          >
                            <Heart className="h-3.5 w-3.5" strokeWidth={2.4} fill="currentColor" />
                            {a.current_hr ?? "-"}
                          </span>
                          {izvor && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {izvor}
                            </span>
                          )}
                        </>
                      ) : (
                        <WatchSlash size={16} />
                      )}
                    </span>

                    <span className="text-right text-[13px] font-semibold tnum">
                      {showKcal ? (
                        `${Math.round(a.current_active_calories ?? 0)} kcal`
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </span>
                  </Link>
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
