import { useCallback, useEffect, useRef } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { ClanarinaLockProvider } from "@/components/clanarina/ClanarinaLockProvider";
import { markWorkoutEntered, hasEnteredWorkout } from "@/lib/workoutSession";

// Layout za sve vezbac tabove (Pocetna, Trening, Rezervisi, Napredak, Clanarina, ...).
// Montiran je SVE VREME dok je vezbac u app-u (parent ruta sa <Outlet/>), pa auto-enter
// radi bez obzira na kom je tabu (ranije je bio u WorkoutHome/Trening tabu -> nije se
// okidao dok korisnik ne ode bas na taj tab). Deljeni "entered" set spreca duplu/povratnu
// navigaciju i ne vuce nazad kad je vezbac vec u ActiveWorkout ekranu.
export const AthleteLayout = () => {
  const { user } = useAuth();
  const nav = useNavigate();

  // false posle unmount-a: async provera ne sme da navigira ako je layout vec otisao.
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  const enterActive = useCallback(
    (sessionId: string | null | undefined, dayId: string | null | undefined) => {
      if (!aliveRef.current) return;
      if (!sessionId || !dayId) return;
      if (hasEnteredWorkout(sessionId)) return;   // vec usao/napustio -> ne vuci nazad
      markWorkoutEntered(sessionId);
      nav(`/vezbac/trening/${dayId}`);
    },
    [nav],
  );

  // Nadji aktivnu sesiju i udji (idempotentno). Auth user se uzima SVEZE (getUser) - app se
  // otvara pre nego auth vrati sesiju; ne zavisi od `user` konteksta -> stabilan callback.
  const enterActiveSessionIfAny = useCallback(async () => {
    if (!aliveRef.current) return;
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id ?? null;
      if (!aliveRef.current) return;
      if (!uid) return;
      const { data } = await supabase
        .from("workout_session_logs")
        .select("id, day_id")
        .eq("athlete_id", uid)
        .eq("is_active", true)
        .is("completed_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!aliveRef.current) return;
      const row = data as any;
      if (row?.id && row?.day_id) enterActive(row.id, row.day_id);
    } catch {
      // tiho: sledeci poll/realtime ponovo proba
    }
  }, [enterActive]);

  // Prva provera na mount.
  useEffect(() => {
    enterActiveSessionIfAny();
  }, [enterActiveSessionIfAny]);

  // Poll na 3s dok je layout montiran I vidljiv - hvata aktivnu sesiju nezavisno od realtime-a
  // i auth tajminga. Gasi se na unmount i kad app ode u pozadinu; na povratak -> odmah provera.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (interval != null) {
        clearInterval(interval);
        interval = null;
      }
    };
    const sync = () => {
      if (document.visibilityState === "visible") {
        enterActiveSessionIfAny();
        if (interval == null) {
          interval = setInterval(() => { enterActiveSessionIfAny(); }, 3000);
        }
      } else {
        stop();
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      stop();
    };
  }, [enterActiveSessionIfAny]);

  // Realtime na workout_live_state - svez start (INSERT) i resume (UPDATE) okinu istu proveru.
  // Heartbeat/pozicija update-i za sesiju u koju smo VEC usli preskacu se bez upita.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`athlete-live-state:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workout_live_state",
          filter: `athlete_id=eq.${user.id}`,
        },
        (payload) => {
          const sid = (payload.new as any)?.session_log_id as string | undefined;
          if (sid && hasEnteredWorkout(sid)) return;
          enterActiveSessionIfAny();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, enterActiveSessionIfAny]);

  return (
    <ClanarinaLockProvider>
      <Outlet />
    </ClanarinaLockProvider>
  );
};

export default AthleteLayout;
