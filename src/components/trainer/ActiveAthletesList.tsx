import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, Card, SectionTitle } from "@/components/ui-bits";
import { Heart, ChevronRight, Activity } from "lucide-react";
import { getHrColor, formatDuration } from "@/lib/workout/hrZone";

type ActiveAthlete = {
  athlete_id: string;
  full_name: string | null;
  session_log_id: string;
  started_at: string;
  current_exercise_idx: number | null;
  current_exercise_name: string | null;
  current_set_number: number | null;
  total_sets: number | null;
  current_hr: number | null;
  total_completed_sets: number | null;
  last_heartbeat: string | null;
};

export const ActiveAthletesList = () => {
  const { user } = useAuth();
  const [athletes, setAthletes] = useState<ActiveAthlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const fetchAthletes = async () => {
    const { data } = await supabase.rpc("get_active_athletes_for_trainer" as any);
    setAthletes(((data as any[]) ?? []) as ActiveAthlete[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchAthletes();
    const id = setInterval(fetchAthletes, 10000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Realtime: any change to workout_live_state triggers a refresh
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`trainer-active:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workout_live_state" },
        () => fetchAthletes(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Tick for elapsed time
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

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

  return (
    <section>
      <SectionTitle>Aktivni vežbači</SectionTitle>
      <ul className="space-y-2">
        {athletes.map((a) => {
          const elapsed = a.started_at ? now - new Date(a.started_at).getTime() : 0;
          const initials = (a.full_name ?? "??").slice(0, 2).toUpperCase();
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
                <div className="relative">
                  <Avatar initials={initials} tone="brand" />
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-card animate-pulse"
                    aria-label="Aktivan"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold leading-tight tracking-tight truncate">
                      {a.full_name ?? "Vežbač"}
                    </span>
                    <span className="text-[11px] font-semibold text-success-soft-foreground tnum shrink-0">
                      trenira {formatDuration(elapsed)}
                    </span>
                  </div>
                  <div className="text-[12.5px] text-muted-foreground mt-0.5 truncate">
                    {exerciseLabel}
                  </div>
                </div>
                {a.current_hr != null && (
                  <div
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold tnum text-white shrink-0"
                    style={{ background: hrColor }}
                  >
                    <Heart className="h-3 w-3" strokeWidth={2.6} />
                    {a.current_hr}
                  </div>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default ActiveAthletesList;
