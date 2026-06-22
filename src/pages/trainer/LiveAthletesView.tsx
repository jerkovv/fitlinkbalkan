import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Heart, Activity, Loader2, Pause } from "lucide-react";
import { Avatar } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import { getHrColor, formatDuration } from "@/lib/workout/hrZone";
import { isHrLive } from "@/lib/liveWorkout";
import { useActiveAthletes } from "@/hooks/useActiveAthletes";

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
                      "relative block overflow-hidden card-premium-hover",
                      // Odmor: suptilno sivlja pozadina, da se mirnije razlikuje od aktivnih.
                      isResting && "bg-surface-2",
                    )}
                  >
                    {/* Tanak akcenat u boji zone; miran (muted) kad je odmor ili puls nije ziv */}
                    <span
                      className={cn(
                        "absolute left-0 top-0 bottom-0 w-[3px]",
                        (!live || isResting) && "bg-muted-foreground/25",
                      )}
                      style={live && !isResting ? { background: hrColor } : undefined}
                    />
                    <div className="flex items-center gap-3 pl-5 pr-4 py-3.5">
                      <div className="relative shrink-0">
                        <Avatar initials={initials} tone="brand" />
                        <span
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-card",
                            live ? "bg-success animate-pulse" : "bg-muted-foreground/40",
                          )}
                          aria-label={live ? "Aktivan" : "Bez živog pulsa"}
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

                      <div className="text-right shrink-0">
                        <div
                          className={cn(
                            "flex items-center justify-end gap-1",
                            !live && "text-muted-foreground",
                          )}
                          style={live ? { color: hrColor } : undefined}
                        >
                          <Heart className="h-4 w-4" strokeWidth={2.4} fill={live ? "currentColor" : "none"} />
                          <span className="font-display text-[22px] font-bold tnum leading-none">
                            {live ? (a.current_hr ?? "-") : "-"}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1 tnum">
                          {kcal} kcal · {timeLabel}
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
