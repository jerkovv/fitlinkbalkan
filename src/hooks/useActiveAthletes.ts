import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { getHrZone } from "@/lib/workout/hrZone";
import { isHrLive, type HrSource } from "@/lib/liveWorkout";

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
  // Puls stize (bilo koji izvor) + odakle - vidi migraciju hr_source_marker.
  hr_last_at: string | null;
  hr_source: HrSource;
  current_state: string | null;
  rest_ends_at: string | null;
  total_completed_sets: number | null;
  last_heartbeat: string | null;
};

const ZONE_RANK: Record<string, number> = { rest: 1, easy: 2, moderate: 3, hard: 4, max: 5 };

// Intenzitet za sortiranje: ziv puls -> rang HR zone (1-5); zastareo/nema -> 0 (na dno).
const intensity = (a: ActiveAthlete): number =>
  isHrLive(a.watch_last_hr_at) || isHrLive(a.hr_last_at)
    ? ZONE_RANK[getHrZone(a.current_hr)]
    : 0;

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
  // Throttle za RPC refetch okinut realtime-om: ziva polja (HR/kalorije/pozicija/rest) se patchuju
  // INSTANT iz realtime payload-a (bez mreze), pa RPC treba samo za strukturu (novi/otisli vezbac,
  // join polja tipa imena). Bez ovoga bi svaki globalni HR event zvao pun RPC.
  const lastFetchRef = useRef(0);
  // Trailing tajmer: kad je realtime event u throttle prozoru, poslednji PRE zatisja se ipak
  // osvezi na kraju prozora (bez njega bi otisli/novi vezbac cekao 10s safety poll).
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAthletes = async () => {
    if (fetchTimerRef.current != null) {
      clearTimeout(fetchTimerRef.current);
      fetchTimerRef.current = null;
    }
    lastFetchRef.current = Date.now();
    const { data } = await supabase.rpc("get_active_athletes_for_trainer" as any);
    setAthletes(((data as any[]) ?? []) as ActiveAthlete[]);
    setLoading(false);
  };

  // Leading throttle (~jednom u 2s); ako je event unutar prozora -> zakazi JEDAN coalesced trailing
  // refetch na kraju prozora, da poslednji event ne zavisi od 10s poll-a. Ziva polja su vec instant.
  const scheduleFetch = () => {
    const since = Date.now() - lastFetchRef.current;
    if (since >= 2000) {
      fetchAthletes();
    } else if (fetchTimerRef.current == null) {
      fetchTimerRef.current = setTimeout(() => {
        fetchTimerRef.current = null;
        fetchAthletes();
      }, 2000 - since);
    }
  };

  // Ocisti trailing tajmer na unmount.
  useEffect(() => () => {
    if (fetchTimerRef.current != null) clearTimeout(fetchTimerRef.current);
  }, []);

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
        (payload) => {
          // INSTANT patch zivih polja postojeceg reda iz payload-a (full replica identity) - HR i
          // last_heartbeat odmah svezi, bez cekanja RPC-a. Redovi van ove liste (drugi treneri) se
          // preskacu. Struktura/novi/otisli i join polja idu kroz throttled refetch ispod.
          const row = (payload as { new?: Record<string, unknown> }).new;
          const sessionLogId = row?.session_log_id as string | undefined;
          if (sessionLogId) {
            setAthletes((prev) => {
              if (!prev.some((a) => a.session_id === sessionLogId)) return prev;
              return prev.map((a) =>
                a.session_id !== sessionLogId
                  ? a
                  : {
                      ...a,
                      current_exercise_idx: (row!.current_exercise_idx as number | null) ?? null,
                      current_exercise_name: (row!.current_exercise_name as string | null) ?? null,
                      current_set_number: (row!.current_set_number as number | null) ?? null,
                      total_sets: (row!.total_sets as number | null) ?? null,
                      total_completed_sets: (row!.total_completed_sets as number | null) ?? null,
                      current_hr: (row!.current_hr as number | null) ?? null,
                      last_heartbeat: (row!.last_heartbeat as string | null) ?? null,
                      current_state: (row!.current_state as string | null) ?? null,
                      rest_ends_at: (row!.rest_ends_at as string | null) ?? null,
                      watch_last_hr_at: (row!.watch_last_hr_at as string | null) ?? null,
                      hr_last_at: (row!.hr_last_at as string | null) ?? null,
                      hr_source: (row!.hr_source as HrSource) ?? null,
                      current_active_calories:
                        (row!.current_active_calories as number | null) ?? a.current_active_calories,
                    },
              );
            });
          }
          scheduleFetch();
        },
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
