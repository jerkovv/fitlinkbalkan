import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Heart, Loader2, Check, Dumbbell, Flame, X } from "lucide-react";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { formatHMS } from "@/lib/time";
import { HR_FRESH_SECONDS, isHrLive } from "@/lib/liveWorkout";
import { ZONE_DEFS } from "@/lib/wearable/hrZones";
import { getHrZone } from "@/lib/workout/hrZone";
import { cn } from "@/lib/utils";
import { FreeWorkoutExercises } from "@/components/workout/FreeWorkoutExercises";

// ---- Nativni Live Activity plugin (iOS-only) ----
// Isti most kao u ActiveWorkout.tsx ("LiveActivity"): definisan lokalno jer svaki
// pozivalac drzi svoj (isto radi i trenerov Dashboard). Sve je no-op van iOS-a /
// bez plugina - ne rusi web ni Android.
type LiveActivityFields = {
  exerciseName: string;
  setNumber: number;
  totalSets: number;
  heartRate?: number;
  hrZone: string;
  isResting: boolean;
  restEndsAtMs?: number;
  isDurationBased: boolean;
  durationMinutes?: number;
  watchConnected: boolean;
  thumbnailUrl?: string;
  weightText?: string;
  isFreeWorkout?: boolean;   // native prelazi na raspored bez vezbe/serija
  activeCalories?: number;
};
interface LiveActivityPluginDef {
  start(options: LiveActivityFields & { athleteName: string; workoutStartedAtMs: number }): Promise<{ success: boolean }>;
  update(options: LiveActivityFields): Promise<{ success: boolean }>;
  end(): Promise<{ success: boolean }>;
  addListener(
    eventName: "laPushToken",
    listenerFunc: (data: { token: string }) => void,
  ): Promise<PluginListenerHandle>;
}
const LiveActivity = registerPlugin<LiveActivityPluginDef>("LiveActivity");
const liveActivitySupported = Capacitor.getPlatform() === "ios";

const laStart = async (opts: LiveActivityFields & { athleteName: string; workoutStartedAtMs: number }) => {
  if (!liveActivitySupported) return;
  try { await LiveActivity.start(opts); } catch { /* iOS < 16.2 / plugin nedostupan -> no-op */ }
};
const laUpdate = async (opts: LiveActivityFields) => {
  if (!liveActivitySupported) return;
  try { await LiveActivity.update(opts); } catch { /* no-op */ }
};
const laEnd = async () => {
  if (!liveActivitySupported) return;
  try { await LiveActivity.end(); } catch { /* no-op */ }
};

// Slobodan trening nema vezbe ni serije - `isFreeWorkout` prebacuje nativni prikaz
// na svoj raspored (stoperica veliko + puls + kalorije), umesto "Serija x/y" reda.
const FREE_LA_TITLE = "Slobodan trening";
const freeLaFields = (
  hr: number | null,
  kcal: number | null,
): LiveActivityFields => ({
  exerciseName: FREE_LA_TITLE,
  setNumber: 0,
  totalSets: 0,
  heartRate: hr ?? undefined,
  hrZone: getHrZone(hr),
  isResting: false,
  isDurationBased: false,
  watchConnected: hr != null,
  isFreeWorkout: true,
  activeCalories: kcal ?? undefined,
});

// Slobodan trening (bez plana): zivi dashboard u Apple stilu - trajanje, puls (+ zona),
// kalorije, prosecan/max puls. Sesija ima day_id = null. Live HR/kalorije = ISTI realtime
// red workout_live_state (current_hr / current_active_calories); finalize = ISTI
// complete_workout_session RPC. Bez vezbi/serija (volumen 0 na rezimeu).
type HRPoint = { ts: string; bpm: number };

// Nazivi zona za zivi ekran (task-spec). Boje se uzimaju iz ZONE_DEFS po BROJU zone da se
// poklope sa finish ekranom (HRZonesChart koristi iste ZONE_DEFS boje po broju zone).
const ZONE_NAMES: Record<number, string> = {
  1: "Zagrevanje",
  2: "Lagano",
  3: "Umereno",
  4: "Naporno",
  5: "Maksimalno",
};
const zoneColorFor = (zone: number): string | undefined =>
  ZONE_DEFS.find((z) => z.zone === zone)?.color;

// Zona 1-5 iz procenta max pulsa (identicno bazi): <60/70/80/90/100+.
const computeZone = (hr: number, maxHr: number): number => {
  const pct = hr / maxHr;
  return pct < 0.6 ? 1 : pct < 0.7 ? 2 : pct < 0.8 ? 3 : pct < 0.9 ? 4 : 5;
};

const AthleteFreeWorkout = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const nav = useNavigate();

  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [watchHr, setWatchHr] = useState<number | null>(null);
  const [watchLastHrAt, setWatchLastHrAt] = useState<string | null>(null);
  const [activeCalories, setActiveCalories] = useState<number | null>(null);
  const [maxHr, setMaxHr] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Vezbe koje trener doda usred SLOBODNOG treninga. plan_version je signal da
  // se spisak promenio; pozicija dolazi iz istog zivog reda, pa nema drugog polla.
  const [planVersion, setPlanVersion] = useState<number | null>(null);
  const [exIdx, setExIdx] = useState<number | null>(null);
  const [setNo, setSetNo] = useState<number | null>(null);
  const [planInfo, setPlanInfo] = useState<{ ukupno: number; totalSets: number | null; zavrseno: boolean } | null>(null);
  // Vezbac je na pitanje "zavrsi ili nastavi" odgovorio "nastavi". Pitanje se ne
  // vraca dok trener ne doda jos vezbi (tada plan_complete opet postane false).
  const [nastavljam, setNastavljam] = useState(false);
  // Da li je ovaj trening IKAD imao zadate vezbe. Bez toga bi cist slobodan
  // trening odmah dobio pitanje "završi ili nastavi": motor za sesiju bez ijedne
  // vezbe uredno kaze da je spisak gotov, jer spiska i nema.
  const [imaoVezbe, setImaoVezbe] = useState(false);
  // X u zaglavlju: prekid treninga (isto kao u klasicnom treningu).
  const [closeOpen, setCloseOpen] = useState(false);
  // Pauza posle serije: motor je upisuje u zivi red, odavde stize do tajmera.
  const [liveState, setLiveState] = useState<string | null>(null);
  const [restEndsAtIso, setRestEndsAtIso] = useState<string | null>(null);

  const hrSeriesRef = useRef<HRPoint[]>([]);
  const finishedRef = useRef(false);
  // Puls sa uparene BLE trake (bez sata). Drzi se odvojeno od watchHr: traka
  // stize pravo u telefon, sat kroz zivi red iz baze.
  const [trakaHr, setTrakaHr] = useState<number | null>(null);
  const trakaPoslednjiPutRef = useRef(0);
  // Cita ga applyLive da isti otkucaj ne bi dva puta usao u seriju: nas
  // heartbeat upise current_hr, pa se taj isti broj vrati kroz realtime.
  const trakaVodiRef = useRef(false);

  const goToSummary = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (!sessionId) { nav("/vezbac/trening", { replace: true }); return; }
    nav(`/vezbac/trening/zavrsen/${sessionId}`, { replace: true });
  }, [nav, sessionId]);

  // 1) Sesija (started_at). Nevalidna -> error; vec zavrsena -> direktno rezime.
  useEffect(() => {
    if (!sessionId || sessionId === "undefined" || sessionId === "null") {
      setLoadError(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("workout_session_logs")
        .select("id, started_at, is_active, completed_at")
        .eq("id", sessionId)
        .maybeSingle();
      if (cancelled) return;
      const row = data as any;
      if (error || !row) { setLoadError(true); return; }
      setStartedAtMs(new Date(row.started_at).getTime());
      if (row.is_active === false || row.completed_at) goToSummary();
    })();
    return () => { cancelled = true; };
  }, [sessionId, goToSummary]);

  // 2) Timer tik 1s (ujedno okida re-render za osvezavanje zive zone / avg-max iz serije).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 3) Efektivni max puls vezbaca (za zonu) - JEDNOM na mount. Ako null -> ne prikazuj zonu.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let uid = user?.id ?? null;
      if (!uid) {
        const { data: authData } = await supabase.auth.getUser();
        uid = authData?.user?.id ?? null;
      }
      if (!uid || cancelled) return;
      const { data, error } = await supabase.rpc("athlete_effective_max_hr", {
        p_athlete_id: uid,
      } as any);
      if (cancelled || error) return;
      const v = typeof data === "number" ? data : Number(data);
      if (Number.isFinite(v) && v > 0) setMaxHr(v);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // 4) Live HR + kalorije (workout_live_state) + detekcija kraja - realtime + poll fallback
  //    (WKWebView realtime zna da prekine, pa poll na 2.5s garantuje osvezavanje).
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const applyLive = (row: any) => {
      if (!row || cancelled || finishedRef.current) return;
      if (row.watch_last_hr_at) setWatchLastHrAt(row.watch_last_hr_at as string);
      const chr = row.current_hr;
      if (typeof chr === "number" && chr > 0) {
        setWatchHr(chr);
        if (!trakaVodiRef.current) {
          hrSeriesRef.current.push({ ts: new Date().toISOString(), bpm: chr });
        }
      }
      const cal = row.current_active_calories;
      if (typeof cal === "number") setActiveCalories(cal);
      if (typeof row.current_state === "string") setLiveState(row.current_state);
      setRestEndsAtIso((row.rest_ends_at as string | null) ?? null);
      if (typeof row.plan_version === "number") setPlanVersion(row.plan_version);
      // NULL je legitimno: kad se spisak zavrsi, zivi red se vrati u slobodan
      // oblik bez tekuce vezbe. Stara provera "if typeof === number" bi tiho
      // zadrzala poslednju vrednost i zaglavila zaglavlje na "Vezba 1 od 1".
      setExIdx(typeof row.current_exercise_idx === "number" ? row.current_exercise_idx : null);
      setSetNo(typeof row.current_set_number === "number" ? row.current_set_number : null);
      if (row.current_state === "completed") goToSummary();
    };

    const fetchLive = async () => {
      if (cancelled || finishedRef.current) return;
      const { data } = await supabase
        .from("workout_live_state")
        .select("current_hr, current_active_calories, watch_last_hr_at, current_state, rest_ends_at, plan_version, current_exercise_idx, current_set_number")
        .eq("session_log_id", sessionId)
        .maybeSingle();
      if (data) applyLive(data);
    };

    const liveChan = supabase
      .channel(`free-live:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workout_live_state", filter: `session_log_id=eq.${sessionId}` },
        (p) => applyLive(p.new),
      )
      .subscribe();

    const endChan = supabase
      .channel(`free-end:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "workout_session_logs", filter: `id=eq.${sessionId}` },
        (p) => {
          const r = p.new as any;
          if (r && (r.is_active === false || r.completed_at)) goToSummary();
        },
      )
      .subscribe();

    fetchLive(); // inicijalni fetch (puls/kalorije odmah, bez cekanja prvog polla)
    const poll = setInterval(fetchLive, 2500);

    return () => {
      cancelled = true;
      supabase.removeChannel(liveChan);
      supabase.removeChannel(endChan);
      clearInterval(poll);
    };
  }, [sessionId, goToSummary]);

  // 4b) Puls sa trake: isti izbor izvora kao u klasicnom treningu (traka pa
  //     HealthKit). Serija se puni ovde, u punoj rezoluciji trake, a na server
  //     ide na 12s kroz athlete_heartbeat - isto kao sto klasican trening radi.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const { startLiveHrSource } = await import("@/lib/wearable/liveHrSource");
      if (cancelled) return;
      cleanup = await startLiveHrSource((bpm, source) => {
        if (finishedRef.current) return;
        if (source !== "sensor") return;
        trakaPoslednjiPutRef.current = Date.now();
        trakaVodiRef.current = true;
        setTrakaHr(bpm);
        hrSeriesRef.current.push({ ts: new Date().toISOString(), bpm });
      });
    })();

    return () => {
      cancelled = true;
      trakaVodiRef.current = false;
      if (cleanup) cleanup();
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const beat = async () => {
      if (finishedRef.current) return;
      if (!trakaVodiRef.current || trakaHr == null) return;
      try {
        await supabase.rpc("athlete_heartbeat", {
          p_session_id: sessionId,
          p_hr: trakaHr,
          p_source: "sensor",
        } as any);
      } catch {
        /* noop */
      }
    };
    beat();
    const id = setInterval(beat, 12000);
    return () => clearInterval(id);
  }, [sessionId, trakaHr]);

  // 5) Zavrsi: ISTA finalize logika kao ActiveWorkout (complete_workout_session sa HR
  //    statistikom + serijom), pa navigacija na rezime. Idempotentno + timeout.
  // Prekid: isti RPC kao u klasicnom treningu. Brise sesiju, pa sa njom i vezbe
  // koje su vezane za nju (ON DELETE CASCADE) - nista ne ostaje da visi.
  const confirmCancel = useCallback(async () => {
    finishedRef.current = true;
    if (sessionId) {
      await supabase.rpc("cancel_workout_session", { p_session_id: sessionId } as any);
      await supabase.from("workout_live_state" as any).delete().eq("session_log_id", sessionId);
    }
    setCloseOpen(false);
    nav("/vezbac");
  }, [sessionId, nav]);

  const finish = useCallback(async () => {
    if (!sessionId || finishing || finishedRef.current) return;
    setFinishing(true);
    const series = hrSeriesRef.current;
    const bpms = series.map((p) => p.bpm).filter((n) => Number.isFinite(n));
    const avg = bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : null;
    const max = bpms.length ? Math.max(...bpms) : null;
    const min = bpms.length ? Math.min(...bpms) : null;

    const rpc = (async () => {
      const { error } = await supabase.rpc("complete_workout_session", {
        p_session_id: sessionId,
        p_hr_avg: avg,
        p_hr_max: max,
        p_hr_min: min,
        p_active_calories: null,
        p_hr_series: series.length ? (series as any) : null,
      } as any);
      if (error) throw error;
    })();
    const timeout = new Promise<void>((r) => setTimeout(r, 4000));
    try { await Promise.race([rpc, timeout]); } catch { /* svejedno idi na rezime */ }
    goToSummary();
  }, [sessionId, finishing, goToSummary]);

  /* ------------------------- Live Activity (iOS lock screen) ------------------------- */
  // START jednom kad znamo pocetak sesije, UPDATE na promenu pulsa/zone/minuta,
  // END na unmount (odlazak na rezime ide kroz navigaciju -> unmount). Citamo SAMO
  // postojeci state - ne diramo poll, realtime ni finalize.
  const laStartedRef = useRef(false);
  const laLastKeyRef = useRef<string>("");
  const laLastHrRef = useRef<number | null>(null);
  const laLastSentAtRef = useRef<number>(0);

  useEffect(() => {
    if (!liveActivitySupported) return;
    if (startedAtMs == null || finishedRef.current) return;

    // Isti izvor pulsa kao prikaz: traka dok salje, inace svez puls sa sata.
    // Stopericu native broji sam (Text(timerInterval:)), pa protekle minute NE treba slati.
    const trakaZaLa =
      trakaHr != null && Date.now() - trakaPoslednjiPutRef.current < HR_FRESH_SECONDS * 1000;
    const hr = trakaZaLa
      ? trakaHr
      : isHrLive(watchLastHrAt) && watchHr && watchHr > 0
        ? watchHr
        : null;
    const kcal = activeCalories != null ? Math.round(activeCalories) : null;
    const fields = freeLaFields(hr, kcal);
    const nowMs = Date.now();

    if (!laStartedRef.current) {
      laStartedRef.current = true;
      laLastKeyRef.current = `${fields.hrZone}|${fields.watchConnected}|${kcal ?? ""}`;
      laLastHrRef.current = hr;
      laLastSentAtRef.current = nowMs;
      laStart({ athleteName: "", workoutStartedAtMs: startedAtMs, ...fields });
      return;
    }

    // Struktura = zona/prisustvo sata/kalorije (salje odmah); sam puls throttle-ovan
    // na >3 bpm ili 5s, isto kao ActiveWorkout - da LA ne bombardujemo update-ima.
    const structKey = `${fields.hrZone}|${fields.watchConnected}|${kcal ?? ""}`;
    const structChanged = structKey !== laLastKeyRef.current;
    const hrDelta = Math.abs((hr ?? 0) - (laLastHrRef.current ?? 0));
    const stale = nowMs - laLastSentAtRef.current > 5000;
    if (structChanged || hrDelta > 3 || stale) {
      laLastKeyRef.current = structKey;
      laLastHrRef.current = hr;
      laLastSentAtRef.current = nowMs;
      laUpdate(fields);
    }
  }, [startedAtMs, now, watchHr, watchLastHrAt, trakaHr, activeCalories]);

  // END na napustanje ekrana (finish/kraj sa sata oba navigiraju -> unmount). Idempotentno.
  useEffect(() => {
    return () => { laEnd(); };
  }, []);

  // Push token: native emituje "laPushToken" kad ga ActivityKit isporuci -> upis u bazu,
  // da server moze da azurira LA dok je telefon zakljucan. iOS-only, tih na gresku.
  useEffect(() => {
    if (!liveActivitySupported) return;
    let handle: PluginListenerHandle | null = null;
    let cancelled = false;
    (async () => {
      try {
        const h = await LiveActivity.addListener("laPushToken", (data) => {
          const token = data?.token;
          if (!token) return;
          supabase.rpc("athlete_set_la_token", { p_token: token } as any)
            .then(() => undefined, () => undefined);
        });
        if (cancelled) { h.remove(); return; }
        handle = h;
      } catch {
        /* plugin/listener nedostupan -> no-op */
      }
    })();
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, []);

  if (loadError) {
    return (
      <div className="h-[100dvh] bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="h-14 w-14 rounded-2xl bg-surface-2 flex items-center justify-center">
          <Dumbbell className="h-6 w-6 text-muted-foreground" strokeWidth={2} />
        </div>
        <p className="text-[15px] font-semibold text-foreground">Trening nije pronađen</p>
        <button
          onClick={() => nav("/vezbac/trening", { replace: true })}
          className="h-11 px-6 rounded-2xl bg-gradient-brand text-white font-semibold shadow-brand active:scale-95 transition"
        >
          Nazad
        </button>
      </div>
    );
  }

  if (startedAtMs == null) {
    return (
      <div className="h-[100dvh] bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="h-16 w-16 rounded-2xl bg-gradient-brand flex items-center justify-center shadow-brand animate-pulse">
          <Dumbbell className="h-7 w-7 text-white" strokeWidth={2.5} />
        </div>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const elapsedS = Math.max(0, Math.floor((now - startedAtMs) / 1000));

  // Puls: traka prva dok stvarno salje (15s, isti prag kao za sat), pa sat kad je
  // svez (isHrLive). Zona: samo kad ima pulsa i max pulsa.
  const trakaSveza = trakaHr != null && now - trakaPoslednjiPutRef.current < HR_FRESH_SECONDS * 1000;
  const live = trakaSveza || isHrLive(watchLastHrAt);
  const hr = trakaSveza ? trakaHr : live && watchHr && watchHr > 0 ? watchHr : null;
  const zoneNum = hr && maxHr && maxHr > 0 ? computeZone(hr, maxHr) : null;
  const zoneName = zoneNum ? ZONE_NAMES[zoneNum] : null;
  const zoneCol = zoneNum ? zoneColorFor(zoneNum) : undefined;

  // Prosecan/Max puls iz akumulirane serije (ista koja ide u complete_workout_session).
  const bpms = hrSeriesRef.current.map((p) => p.bpm).filter((n) => Number.isFinite(n) && n > 0);
  const hrAvg = bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : null;
  const hrPeak = bpms.length ? Math.max(...bpms) : null;

  const imaVezbe = (planInfo?.ukupno ?? 0) > 0;

  return (
    <div className="h-[100dvh] overflow-y-auto bg-background">
      {/* Zaglavlje kao u klasicnom treningu: izlaz na X, sta se trenutno radi i
          puls. Bez njega se iz slobodnog treninga moglo izaci samo zavrsavanjem. */}
      <div
        className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-hairline"
        style={{ paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 8px)" }}
      >
        <div className="mx-auto w-full max-w-[440px] px-4 pb-3 flex items-center gap-3">
          <button
            onClick={() => setCloseOpen(true)}
            aria-label="Zatvori"
            className="h-10 w-10 rounded-full bg-surface border border-hairline flex items-center justify-center shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Slobodan trening · {formatHMS(elapsedS)}
            </div>
            <div className="text-[13px] font-bold text-foreground truncate">
              {imaVezbe && exIdx != null
                ? `Vežba ${Math.min(exIdx + 1, planInfo!.ukupno)} od ${planInfo!.ukupno}` +
                  (setNo != null && planInfo!.totalSets
                    ? ` · Serija ${Math.min(setNo, planInfo!.totalSets)} od ${planInfo!.totalSets}`
                    : "")
                : "Bez plana"}
            </div>
          </div>
          <div
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-surface border border-hairline shrink-0"
            style={{ color: zoneCol }}
            aria-label="Trenutni puls"
          >
            <Heart
              className={cn("h-3.5 w-3.5", hr && "animate-pulse")}
              strokeWidth={2.4}
              fill={hr ? "currentColor" : "none"}
            />
            <span className="text-[13px] font-bold tnum leading-none">{hr ?? "-"}</span>
          </div>
        </div>
      </div>

      <div
        className="mx-auto w-full max-w-[440px] min-h-screen flex flex-col px-6 pt-5"
      >

        {/* Kad trener doda vezbe, glavna stvar na ekranu vise nije stoperica nego
            vezba koja se radi - isto kao u klasicnom treningu. Zato se ceo zivi
            dashboard skuplja u jedan red, a vezba ide gore. Bez vezbi (obicna
            stoperica) ostaje sve kako je i bilo. */}
        {imaVezbe ? (
          <div className="grid grid-cols-3 gap-2 py-3">
            <MiniTile label="Trajanje" value={formatHMS(elapsedS)} />
            <MiniTile label="Puls" value={hr ? `${hr}` : "-"} />
            <MiniTile label="Kalorije" value={activeCalories != null ? `${Math.round(activeCalories)}` : "-"} />
          </div>
        ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-7 py-6">
          {/* Trajanje (hero) */}
          <div className="text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-2">
              Trajanje
            </div>
            <div className="font-display text-[64px] font-bold tracking-tightest tnum leading-none">
              {formatHMS(elapsedS)}
            </div>
          </div>

          {/* Puls (trenutni) + zona */}
          <div className="flex flex-col items-center gap-2">
            <div
              className="inline-flex items-end gap-2.5"
              style={{ color: zoneCol }}
              aria-label="Trenutni puls"
            >
              <Heart
                className={cn("h-8 w-8 mb-1.5", hr && "animate-pulse")}
                strokeWidth={2.4}
                fill={hr ? "currentColor" : "none"}
              />
              <span className="font-display text-[54px] font-bold tnum leading-none">
                {hr ?? "-"}
              </span>
              <span className="text-[15px] font-semibold text-muted-foreground mb-2">bpm</span>
            </div>
            {zoneName && (
              <div className="text-[15px] font-bold leading-none" style={{ color: zoneCol }}>
                {zoneName}
              </div>
            )}
            {/* 5-segmentni zona bar: pun rasterni ramp (svaki slot u svojoj zona-boji),
                neaktivni priguseni, trenutna zona puna - citljivo i na svetloj pozadini. */}
            {zoneNum && (
              <div className="flex items-center gap-1 mt-0.5">
                {[1, 2, 3, 4, 5].map((z) => (
                  <span
                    key={z}
                    className={cn(
                      "h-1.5 w-7 rounded-full transition-all",
                      z !== zoneNum && "opacity-40",
                    )}
                    style={{ background: zoneColorFor(z) }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Kalorije (0 ako jos nema) */}
          <div className="inline-flex items-center gap-2 h-12 px-5 rounded-full bg-surface border border-hairline">
            <Flame className="h-5 w-5" style={{ color: "hsl(24 90% 55%)" }} fill="currentColor" strokeWidth={2} />
            <span className="font-display text-[22px] font-bold tnum leading-none">
              {Math.round(activeCalories ?? 0)}
            </span>
            <span className="text-[13px] font-semibold text-muted-foreground">kcal</span>
          </div>

          {/* Prosecan / Max puls (iz serije; sakriveno dok nema podataka) */}
          {hrAvg != null && (
            <div className="grid grid-cols-2 gap-3 w-full max-w-[300px]">
              <MiniTile label="Prosečan puls" value={`${hrAvg} bpm`} />
              <MiniTile label="Max puls" value={`${hrPeak} bpm`} />
            </div>
          )}
        </div>

        )}

        {/* Vezbe koje je trener dodao usred treninga. Dok ih nema, komponenta
            vraca null i ekran ostaje isti kakav je i bio - cista stoperica. */}
        {sessionId && (
          <FreeWorkoutExercises
            sessionId={sessionId}
            planVersion={planVersion}
            currentIdx={exIdx}
            currentSetNumber={setNo}
            disabled={finishing}
            onPlan={(info) => {
              setPlanInfo(info);
              if (info.ukupno > 0) setImaoVezbe(true);
              if (!info.zavrseno) setNastavljam(false);
            }}
            liveState={liveState}
            restEndsAtIso={restEndsAtIso}
          />
        )}

        {/* Spisak zadatih vezbi je gotov, ali trening TRAJE. Ranije se sesija
            ovde sama zatvarala i izbacivala coveka na rezime, i usred trcanja.
            Pitanje stize i kad trener skloni ostatak spiska, ne samo kad ga
            vezbac odradi do kraja - u oba slucaja vezbi vise nema. */}
        {planInfo?.zavrseno && imaoVezbe && !nastavljam && (
          <div className="rounded-2xl border border-primary/30 bg-primary-soft/40 p-4 mb-2">
            <div className="text-[14px] font-semibold">Nemaš više zadatih vežbi</div>
            <div className="text-[12.5px] text-muted-foreground mt-1">
              Možeš da završiš trening ili da nastaviš slobodno - štoperica i puls i dalje rade.
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={finish}
                disabled={finishing}
                className="h-11 flex-1 rounded-xl bg-gradient-brand text-white text-[13.5px] font-semibold shadow-brand disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={3} />}
                Završi trening
              </button>
              <button
                onClick={() => setNastavljam(true)}
                className="h-11 flex-1 rounded-xl bg-surface-2 text-[13.5px] font-semibold text-muted-foreground hover:text-foreground transition"
              >
                Nastavi slobodno
              </button>
            </div>
          </div>
        )}

        {/* Zavrsi */}
        <div
          className="pt-4"
          style={{ paddingBottom: "calc(max(env(safe-area-inset-bottom), 16px) + 16px)" }}
        >
          {imaVezbe ? (
            <button
              onClick={finish}
              disabled={finishing}
              className="w-full text-[12px] font-semibold text-muted-foreground py-3 disabled:opacity-50"
            >
              {finishing ? "Završavam..." : "Završi trening odmah"}
            </button>
          ) : (
            <button
              onClick={finish}
              disabled={finishing}
              className="w-full h-14 rounded-2xl bg-gradient-brand text-white font-bold text-[15px] inline-flex items-center justify-center gap-2 shadow-brand active:scale-[0.98] transition disabled:opacity-60"
            >
              {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={3} />}
              {finishing ? "Završavam..." : "Završi trening"}
            </button>
          )}
        </div>
      </div>

      <AlertDialog open={closeOpen} onOpenChange={setCloseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Prekini trening?</AlertDialogTitle>
            <AlertDialogDescription>
              Da li želiš da prekineš trening? Sav napredak će biti izgubljen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel}>Da, prekini</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const MiniTile = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl bg-surface border border-hairline px-3 py-2.5 text-center">
    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {label}
    </div>
    <div className="font-display text-[20px] font-bold tnum text-foreground mt-0.5">{value}</div>
  </div>
);

export default AthleteFreeWorkout;
