import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { getHrZone } from "@/lib/workout/hrZone";
import { isHrLive } from "@/lib/liveWorkout";

// Jedan red iz RPC get_active_athletes_for_trainer (deljen izvor za pocetnu listu i
// stranicu "Trenira uzivo").
export type ActiveAthlete = {
  athlete_id: string;
  athlete_name: string | null;
  session_id: string;
  started_at: string;
  current_exercise_idx: number | null;
  current_exercise_name: string | null;
  current_set_number: number | null;
  total_sets: number | null;
  current_hr: number | null;
  current_active_calories: number;
  watch_last_hr_at: string | null;
  current_state: string | null;
  rest_ends_at: string | null;
  total_completed_sets: number | null;
  last_heartbeat: string | null;
};

const ZONE_RANK: Record<string, number> = { rest: 1, easy: 2, moderate: 3, hard: 4, max: 5 };

// Intenzitet za sortiranje: ziv puls -> rang HR zone (1-5); zastareo/nema -> 0 (na dno).
const intensity = (a: ActiveAthlete): number =>
  isHrLive(a.watch_last_hr_at) ? ZONE_RANK[getHrZone(a.current_hr)] : 0;

// Deljeni izvor aktivnih vezbaca: isti fetch (RPC) + 10s poll + realtime na
// workout_live_state + 1s tik za tacno proteklo vreme. Vraca SORTIRANO:
// najintenzivniji (HR zona) gore, pa duzi trening (raniji started_at) gore.
export const useActiveAthletes = () => {
  const { user } = useAuth();
  const [athletes, setAthletes] = useState<ActiveAthlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  // Jedinstven sufiks kanala po instanci, da dve mountovane instance (npr. brzi prelaz
  // pocetna -> /trener/uzivo) ne dele isti realtime kanal po imenu.
  const channelIdRef = useRef(Math.random().toString(36).slice(2));

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

  // Realtime: bilo koja promena workout_live_state -> osvezi.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`trainer-active:${user.id}:${channelIdRef.current}`)
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

  // 1s tik (isto kao detalj LiveWorkoutView) -> "trenira X" i odmor m:ss su tacni.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const sorted = useMemo(() => {
    return [...athletes].sort((a, b) => {
      const di = intensity(b) - intensity(a);
      if (di !== 0) return di;
      return new Date(a.started_at).getTime() - new Date(b.started_at).getTime();
    });
  }, [athletes]);

  return { athletes: sorted, now, loading };
};
