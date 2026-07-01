import { useCallback, useEffect, useRef, useState } from "react";
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

  // PRIVREMENI vidljivi debug (ukloniti kad se potvrdi da radi): auto-enter status uzivo.
  const [aeDebug, setAeDebug] = useState<string>("init");
  const tickRef = useRef(0);
  const dbg = useCallback((msg: string) => {
    setAeDebug(`tick#${tickRef.current} | ${msg}`);
  }, []);

  const enterActive = useCallback(
    (sessionId: string | null | undefined, dayId: string | null | undefined) => {
      if (!aliveRef.current) return;
      if (!sessionId || !dayId) return;
      if (hasEnteredWorkout(sessionId)) return;   // vec usao/napustio -> ne vuci nazad
      markWorkoutEntered(sessionId);
      console.log(`[autoenter] navigating day=${dayId}`);
      nav(`/vezbac/trening/${dayId}`);
    },
    [nav],
  );

  // Nadji aktivnu sesiju i udji (idempotentno). Auth user se uzima SVEZE (getUser) - app se
  // otvara pre nego auth vrati sesiju; ne zavisi od `user` konteksta -> stabilan callback.
  const enterActiveSessionIfAny = useCallback(async () => {
    if (!aliveRef.current) return;
    dbg("checking... " + new Date().toLocaleTimeString());
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id ?? null;
      if (!aliveRef.current) return;
      const uid8 = uid ? uid.slice(0, 8) : "NULL";
      dbg("user=" + uid8);
      if (!uid) {
        console.log("[autoenter] check user=null found=none");
        return;
      }
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
      dbg(
        "user=" + uid8 + " found=" +
          (row ? row.id.slice(0, 8) + " day=" + row.day_id.slice(0, 8) : "NONE"),
      );
      console.log(`[autoenter] check user=${uid} found=${row?.id ?? "none"}`);
      if (row?.id && row?.day_id) {
        dbg("NAV -> " + row.day_id.slice(0, 8));
        enterActive(row.id, row.day_id);
      }
    } catch (e) {
      dbg("ERR: " + String(e).slice(0, 80));
    }
  }, [enterActive, dbg]);

  // Mount marker + prva provera.
  useEffect(() => {
    console.log("[autoenter] layout mounted");
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
          interval = setInterval(() => {
            tickRef.current += 1;   // brojac da se vidi da interval stvarno tikuje
            enterActiveSessionIfAny();
          }, 3000);
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

      {/* PRIVREMENI debug panel (ukloniti kad se potvrdi) - vidljiv na SVAKOM vezbac tabu. */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          background: "rgba(0,0,0,0.85)",
          color: "#0f0",
          font: "11px monospace",
          padding: "6px 8px calc(6px + env(safe-area-inset-bottom))",
        }}
      >
        AE: {aeDebug}
      </div>
    </ClanarinaLockProvider>
  );
};

export default AthleteLayout;
