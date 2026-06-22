import { Link } from "react-router-dom";
import { Avatar, Card, SectionTitle } from "@/components/ui-bits";
import { Heart, ChevronRight, Activity, Flame, ArrowRight } from "lucide-react";
import { getHrColor, formatDuration } from "@/lib/workout/hrZone";
import { isHrLive } from "@/lib/liveWorkout";
import { useActiveAthletes } from "@/hooks/useActiveAthletes";

// Pocetna trenera: prikazuje prva 3 aktivna vezbaca (posle istog sortiranja kao
// stranica "Trenira uzivo"), pa dugme "Pogledaj sve" ako ih ima vise. Izvor podataka,
// realtime i 1s tik su u deljenom hook-u useActiveAthletes (isti kao /trener/uzivo).
const MAX_ON_HOME = 3;

export const ActiveAthletesList = () => {
  const { athletes, now, loading } = useActiveAthletes();

  if (loading) return null;

  if (!athletes.length) {
    return (
      <section>
        <SectionTitle>Aktivni vežbači</SectionTitle>
        <Card className="p-5 text-center">
          <Activity className="h-7 w-7 mx-auto mb-2 text-muted-foreground/60" strokeWidth={1.5} />
          <div className="text-[13px] text-muted-foreground">
            Nijedan vežbač trenutno ne trenira
          </div>
        </Card>
      </section>
    );
  }

  const total = athletes.length;
  const visible = athletes.slice(0, MAX_ON_HOME);

  return (
    <section>
      <SectionTitle>Aktivni vežbači</SectionTitle>
      <ul className="space-y-2">
        {visible.map((a) => {
          const elapsed = a.started_at ? now - new Date(a.started_at).getTime() : 0;
          const initials = (a.athlete_name ?? "??").slice(0, 2).toUpperCase();
          const hrColor = getHrColor(a.current_hr);
          const exerciseLabel = a.current_exercise_name
            ? `${a.current_exercise_name} · Serija ${a.current_set_number ?? 1}`
            : "Priprema...";
          return (
            <li key={a.athlete_id}>
              <Link
                to={`/trener/vezbac/${a.athlete_id}/live`}
                className="flex items-center gap-3 card-premium-hover px-4 py-3.5"
              >
                <div className="relative shrink-0">
                  <Avatar initials={initials} tone="brand" />
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-card animate-pulse"
                    aria-label="Aktivan"
                  />
                </div>

                {/* Srednja kolona dobija punu sirinu (samo avatar i strelica je flankiraju),
                    pa se ime i vezba lepo vide; metrike idu u svoj red ispod. */}
                <div className="flex-1 min-w-0">
                  {/* Ime + vreme treninga (tika 1s -> tacno) */}
                  <div className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 text-[15px] font-semibold leading-tight tracking-tight truncate">
                      {a.athlete_name ?? "Vežbač"}
                    </span>
                    <span className="text-[11px] font-semibold text-success-soft-foreground tnum shrink-0">
                      trenira {formatDuration(elapsed)}
                    </span>
                  </div>

                  {/* Koja vezba - puna sirina reda, znatno manje secenja */}
                  <div className="text-[12.5px] text-muted-foreground mt-0.5 truncate">
                    {exerciseLabel}
                  </div>

                  {/* Metrike u svom redu: puls (isti prag svezine kao detalj) + aktivne kalorije */}
                  <div className="flex items-center gap-1.5 mt-2">
                    {isHrLive(a.watch_last_hr_at) ? (
                      <div
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold tnum text-white"
                        style={{ background: hrColor }}
                      >
                        <Heart className="h-3 w-3" strokeWidth={2.6} />
                        {a.current_hr ?? "-"}
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold tnum border border-hairline text-muted-foreground">
                        <Heart className="h-3 w-3" strokeWidth={2.6} />
                        -
                      </div>
                    )}
                    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold tnum border border-hairline text-foreground">
                      <Flame className="h-3 w-3" strokeWidth={2.6} />
                      {Math.round(a.current_active_calories ?? 0)} kcal
                    </div>
                  </div>
                </div>

                <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0 self-center" />
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Vise od 3 aktivna -> dugme ka punoj listi (/trener/uzivo). */}
      {total > MAX_ON_HOME && (
        <Link
          to="/trener/uzivo"
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-gradient-brand px-4 py-3.5 text-[13px] font-semibold text-white shadow-brand transition active:scale-[0.98]"
        >
          Pogledaj sve vežbače ({total})
          <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
        </Link>
      )}
    </section>
  );
};

export default ActiveAthletesList;
