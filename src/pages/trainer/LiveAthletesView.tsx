import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Dumbbell, Flame, Heart, Activity, Loader2, Pause } from "lucide-react";
import { ZaustaviTreningDugme, ZaboravljenTreningTraka, jeZaboravljen } from "@/components/trainer/ZaustaviTrening";
import { NiskaBaterijaIkonica } from "@/components/trainer/NiskaBaterijaIkonica";
import { baterijaSesije } from "@/lib/baterija";
import { Avatar } from "@/components/ui-bits";
import { PhoneShell } from "@/components/PhoneShell";
import { cn } from "@/lib/utils";
import { getHrColor, formatDuration } from "@/lib/workout/hrZone";
import { isWatchConnected } from "@/lib/liveWorkout";
import { useActiveAthletes } from "@/hooks/useActiveAthletes";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { WatchSlash } from "@/components/trainer/WatchSlash";

// Puna lista aktivnih vezbaca ("Trenira uzivo"). Isti izvor/sort kao pocetna
// (useActiveAthletes), bogate kartice; klik -> isti detaljni LiveWorkoutView.
const fmtRest = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
};

const LiveAthletesView = () => {
  const nav = useNavigate();
  const { athletes, now, loading, ukloni } = useActiveAthletes();
  const desktop = useDesktopWeb();

  if (desktop) {
    // Racunar: sazetak u redu plocica pa mreza kartica. Telefonski raspored je
    // ovde bio sopstveni 100dvh scroll okvir uzak 440px usred TrainerWebShell-a.
    const naOdmoru = athletes.filter(
      (a) =>
        a.current_state === "rest" &&
        !!a.rest_ends_at &&
        new Date(a.rest_ends_at).getTime() - now > 0,
    ).length;
    const pulsevi = athletes
      .filter((a) => isWatchConnected(a.watch_last_hr_at, now))
      .map((a) => a.current_hr)
      .filter((h): h is number => typeof h === "number" && h > 0);
    const prosecanPuls = pulsevi.length
      ? Math.round(pulsevi.reduce((s, h) => s + h, 0) / pulsevi.length)
      : null;

    const sazetak = [
      { label: "Trenira sada", value: athletes.length, unit: athletes.length === 1 ? "vežbač" : "vežbača" },
      { label: "U seriji", value: athletes.length - naOdmoru, unit: "aktivno" },
      { label: "Na odmoru", value: naOdmoru, unit: "pauza" },
      { label: "Prosečan puls", value: prosecanPuls ?? "-", unit: prosecanPuls ? "bpm" : "bez sata" },
    ];

    return (
      <PhoneShell
        eyebrow="Pregled"
        title="Trenira uživo"
        desktopWidth="wide"
        action={
          athletes.length > 0 ? (
            <span className="inline-flex h-10 items-center gap-2 rounded-full bg-success-soft px-4">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span className="text-[13px] font-bold tnum text-success-soft-foreground">
                {athletes.length} uživo
              </span>
            </span>
          ) : undefined
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : athletes.length === 0 ? (
          <div className="card-premium flex flex-col items-center px-6 py-20 text-center">
            <div className="h-14 w-14 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
              <Activity className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.5} />
            </div>
            <div className="font-display text-[17px] font-bold tracking-tight">Niko ne trenira trenutno</div>
            <div className="text-[13px] text-muted-foreground mt-1 leading-snug max-w-[320px]">
              Kad vežbač pokrene trening, pojaviće se ovde uživo.
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {sazetak.map((s) => (
                <div key={s.label} className="card-premium p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {s.label}
                  </div>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="font-display text-[30px] leading-none font-bold tracking-tightest tnum">
                      {s.value}
                    </span>
                    <span className="text-[13px] font-medium text-muted-foreground">{s.unit}</span>
                  </div>
                </div>
              ))}
            </div>

            <ul className="grid grid-cols-2 xl:grid-cols-3 gap-4">
              {athletes.map((a) => {
                const initials = (a.athlete_name ?? "??").slice(0, 2).toUpperCase();
                const live = isWatchConnected(a.watch_last_hr_at, now);
                const hrColor = getHrColor(a.current_hr);
                const timeLabel = formatDuration(a.started_at ? now - new Date(a.started_at).getTime() : 0);
                const kcal = Math.round(a.current_active_calories ?? 0);
                const restMs = a.rest_ends_at ? new Date(a.rest_ends_at).getTime() - now : 0;
                const isResting = a.current_state === "rest" && restMs > 0;

                return (
                  <li key={a.athlete_id} className="relative">
                    <Link
                      to={`/trener/vezbac/${a.athlete_id}/live`}
                      className={cn(
                        "group card-premium-hover flex h-full min-h-[196px] flex-col p-5",
                        // Odmor: suptilno sivlja pozadina, kao na telefonu.
                        isResting && "bg-surface-2",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <Avatar initials={initials} tone="brand" />
                          <span
                            className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-card bg-success animate-pulse"
                            aria-label="Aktivan"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="font-display text-[17px] font-bold leading-tight tracking-tight truncate">
                              {a.athlete_name ?? "Vežbač"}
                            </span>
                            <NiskaBaterijaIkonica
                              traka={baterijaSesije(a.sensor_battery, a.sensor_battery_at, a.started_at)}
                              sat={baterijaSesije(a.watch_battery, a.watch_battery_at, a.started_at)}
                            />
                          </div>
                          <div
                            className={cn(
                              "mt-0.5 text-[12.5px] tnum",
                              jeZaboravljen(a.started_at, now) ? "text-destructive" : "text-muted-foreground",
                            )}
                          >
                            trenira {timeLabel}
                          </div>
                        </div>
                        {/* Mesto za "Zaustavi", koje je van Link-a (vidi ispod). */}
                        <span className="w-[92px] shrink-0" aria-hidden="true" />
                      </div>

                      <div
                        className={cn(
                          "mt-4 flex min-w-0 items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium",
                          isResting ? "bg-surface text-muted-foreground" : "bg-surface-2 text-foreground",
                        )}
                      >
                        {isResting ? (
                          <>
                            <Pause className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
                            <span className="tnum">Odmor {fmtRest(restMs)}</span>
                          </>
                        ) : a.current_exercise_name ? (
                          <>
                            <Dumbbell className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.4} />
                            <span className="min-w-0 truncate">{a.current_exercise_name}</span>
                            <span className="ml-auto shrink-0 text-[12px] text-muted-foreground tnum">
                              Serija {a.current_set_number ?? 1}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Priprema...</span>
                        )}
                      </div>

                      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                        {live ? (
                          <div className="flex items-baseline gap-1.5" style={{ color: hrColor }}>
                            <Heart className="h-4 w-4 self-center" strokeWidth={2.4} fill="currentColor" />
                            <span className="font-display text-[30px] font-bold leading-none tnum">
                              {a.current_hr ?? "-"}
                            </span>
                            <span className="text-[12px] font-semibold text-muted-foreground">bpm</span>
                          </div>
                        ) : (
                          // Bez sata -> precrtan sat (kao LA kartica), na mestu pulsa.
                          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                            <WatchSlash size={20} />
                            Bez sata
                          </div>
                        )}
                        {live && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground tnum",
                              isResting ? "bg-surface" : "bg-surface-2",
                            )}
                          >
                            <Flame className="h-3.5 w-3.5" strokeWidth={2.4} />
                            {kcal} kcal
                          </span>
                        )}
                      </div>
                    </Link>
                    <div className="absolute right-5 top-[1.625rem]">
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
          </div>
        )}
      </PhoneShell>
    );
  }

  return (
    <div className="h-[100dvh] overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-[440px] min-h-screen relative pb-10">
        {/* Header */}
        <div
          className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-hairline"
          style={{ paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 8px)" }}
        >
          <div className="px-4 pb-3 flex items-center gap-3">
            <button
              onClick={() => nav(-1)}
              aria-label="Nazad"
              className="h-10 w-10 rounded-full bg-surface border border-hairline flex items-center justify-center shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="font-display text-[20px] font-semibold tracking-tight flex-1">
              Trenira uživo
            </div>
            {athletes.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success-soft shrink-0">
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                <span className="text-[13px] font-bold tnum text-success-soft-foreground">
                  {athletes.length}
                </span>
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : athletes.length === 0 ? (
          <div className="px-4 pt-16 flex flex-col items-center text-center">
            <div className="h-14 w-14 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
              <Activity className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.5} />
            </div>
            <div className="font-display text-[15px] font-semibold">Niko ne trenira trenutno</div>
            <div className="text-[13px] text-muted-foreground mt-1 leading-snug max-w-[260px]">
              Kad vežbač pokrene trening, pojaviće se ovde uživo.
            </div>
          </div>
        ) : (
          <ul className="px-4 pt-4 space-y-2.5">
            {athletes.map((a) => {
              const initials = (a.athlete_name ?? "??").slice(0, 2).toUpperCase();
              const live = isWatchConnected(a.watch_last_hr_at, now);
              const hrColor = getHrColor(a.current_hr);
              const timeLabel = formatDuration(a.started_at ? now - new Date(a.started_at).getTime() : 0);
              const kcal = Math.round(a.current_active_calories ?? 0);
              const restMs = a.rest_ends_at ? new Date(a.rest_ends_at).getTime() - now : 0;
              const isResting = a.current_state === "rest" && restMs > 0;
              const zaboravljen = jeZaboravljen(a.started_at, now);

              return (
                <li key={a.athlete_id} className="relative">
                  <Link
                    to={`/trener/vezbac/${a.athlete_id}/live`}
                    className={cn(
                      "block card-premium-hover",
                      // Odmor: suptilno sivlja pozadina, da se mirnije razlikuje od aktivnih.
                      isResting && "bg-surface-2",
                    )}
                  >
                    <div className={cn("flex items-center gap-3 px-4 py-3.5", zaboravljen && "pb-[3.75rem]")}>
                      <div className="relative shrink-0">
                        <Avatar initials={initials} tone="brand" />
                        {/* Uvek zeleno: prikazan ovde = trenira = aktivan (nezavisno od sata). */}
                        <span
                          className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-card bg-success animate-pulse"
                          aria-label="Aktivan"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="font-display text-[16px] font-semibold leading-tight tracking-tight truncate">
                            {a.athlete_name ?? "Vežbač"}
                          </span>
                          <NiskaBaterijaIkonica
                            traka={baterijaSesije(a.sensor_battery, a.sensor_battery_at, a.started_at)}
                            sat={baterijaSesije(a.watch_battery, a.watch_battery_at, a.started_at)}
                          />
                        </div>
                        <div className="text-[12.5px] text-muted-foreground mt-0.5 truncate flex items-center gap-1.5">
                          {isResting ? (
                            <>
                              <Pause className="h-3 w-3 shrink-0" strokeWidth={2.4} />
                              Odmor {fmtRest(restMs)}
                            </>
                          ) : a.current_exercise_name ? (
                            `${a.current_exercise_name} · Serija ${a.current_set_number ?? 1}`
                          ) : (
                            "Priprema..."
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end text-right shrink-0">
                        {live ? (
                          <div
                            className="flex items-center justify-end gap-1"
                            style={{ color: hrColor }}
                          >
                            <Heart className="h-3.5 w-3.5" strokeWidth={2.4} fill="currentColor" />
                            <span className="font-display text-[20px] font-bold tnum leading-none">
                              {a.current_hr ?? "-"}
                            </span>
                          </div>
                        ) : (
                          // Bez sata -> precrtan sat (kao LA kartica), na mestu pulsa.
                          <WatchSlash size={18} />
                        )}
                        <div className="text-[12.5px] text-muted-foreground mt-1 tnum">
                          {live ? `${kcal} kcal · ${timeLabel}` : timeLabel}
                        </div>
                      </div>
                    </div>
                  </Link>
                  <ZaboravljenTreningTraka
                    sessionId={a.session_id}
                    athleteName={a.athlete_name}
                    startedAt={a.started_at}
                    now={now}
                    onStopped={() => ukloni(a.session_id)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default LiveAthletesView;
