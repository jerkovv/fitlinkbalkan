import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Heart, Activity, Loader2, Pause } from "lucide-react";
import { Avatar } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import { getHrColor, formatDuration } from "@/lib/workout/hrZone";
import { isHrLive } from "@/lib/liveWorkout";
import { useActiveAthletes } from "@/hooks/useActiveAthletes";
import { WatchSlash } from "@/components/trainer/WatchSlash";

// Puna lista aktivnih vezbaca ("Trenira uzivo"). Isti izvor/sort kao pocetna
// (useActiveAthletes), bogate kartice; klik -> isti detaljni LiveWorkoutView.
const fmtRest = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
};

const LiveAthletesView = () => {
  const nav = useNavigate();
  const { athletes, now, loading } = useActiveAthletes();

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
              const live = isHrLive(a.watch_last_hr_at);
              const hrColor = getHrColor(a.current_hr);
              const timeLabel = formatDuration(a.started_at ? now - new Date(a.started_at).getTime() : 0);
              const kcal = Math.round(a.current_active_calories ?? 0);
              const restMs = a.rest_ends_at ? new Date(a.rest_ends_at).getTime() - now : 0;
              const isResting = a.current_state === "rest" && restMs > 0;

              return (
                <li key={a.athlete_id}>
                  <Link
                    to={`/trener/vezbac/${a.athlete_id}/live`}
                    className={cn(
                      "block card-premium-hover",
                      // Odmor: suptilno sivlja pozadina, da se mirnije razlikuje od aktivnih.
                      isResting && "bg-surface-2",
                    )}
                  >
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <div className="relative shrink-0">
                        <Avatar initials={initials} tone="brand" />
                        {/* Uvek zeleno: prikazan ovde = trenira = aktivan (nezavisno od sata). */}
                        <span
                          className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-card bg-success animate-pulse"
                          aria-label="Aktivan"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-display text-[16px] font-semibold leading-tight tracking-tight truncate">
                          {a.athlete_name ?? "Vežbač"}
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
