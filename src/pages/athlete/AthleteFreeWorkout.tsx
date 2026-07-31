import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Heart, Loader2, Check, Dumbbell, Flame } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { formatHMS } from "@/lib/time";
import { isHrLive } from "@/lib/liveWorkout";
import { ZONE_DEFS } from "@/lib/wearable/hrZones";
import { cn } from "@/lib/utils";

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

  const hrSeriesRef = useRef<HRPoint[]>([]);
  const finishedRef = useRef(false);

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
        hrSeriesRef.current.push({ ts: new Date().toISOString(), bpm: chr });
      }
      const cal = row.current_active_calories;
      if (typeof cal === "number") setActiveCalories(cal);
      if (row.current_state === "completed") goToSummary();
    };

    const fetchLive = async () => {
      if (cancelled || finishedRef.current) return;
      const { data } = await supabase
        .from("workout_live_state")
        .select("current_hr, current_active_calories, watch_last_hr_at, current_state")
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

  // 5) Zavrsi: ISTA finalize logika kao ActiveWorkout (complete_workout_session sa HR
  //    statistikom + serijom), pa navigacija na rezime. Idempotentno + timeout.
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

  // Puls: samo kad je svez (isHrLive). Zona: samo kad ima pulsa i max pulsa.
  const live = isHrLive(watchLastHrAt);
  const hr = live && watchHr && watchHr > 0 ? watchHr : null;
  const zoneNum = hr && maxHr && maxHr > 0 ? computeZone(hr, maxHr) : null;
  const zoneName = zoneNum ? ZONE_NAMES[zoneNum] : null;
  const zoneCol = zoneNum ? zoneColorFor(zoneNum) : undefined;

  // Prosecan/Max puls iz akumulirane serije (ista koja ide u complete_workout_session).
  const bpms = hrSeriesRef.current.map((p) => p.bpm).filter((n) => Number.isFinite(n) && n > 0);
  const hrAvg = bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : null;
  const hrPeak = bpms.length ? Math.max(...bpms) : null;

  return (
    <div className="h-[100dvh] overflow-y-auto bg-background">
      <div
        className="mx-auto w-full max-w-[440px] min-h-screen flex flex-col px-6"
        style={{ paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 20px)" }}
      >
        <div className="text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Slobodan trening
          </div>
        </div>

        {/* Zivi dashboard (Apple stil): trajanje -> puls+zona -> kalorije -> avg/max */}
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

        {/* Zavrsi */}
        <div
          className="pt-4"
          style={{ paddingBottom: "calc(max(env(safe-area-inset-bottom), 16px) + 16px)" }}
        >
          <button
            onClick={finish}
            disabled={finishing}
            className="w-full h-14 rounded-2xl bg-gradient-brand text-white font-bold text-[15px] inline-flex items-center justify-center gap-2 shadow-brand active:scale-[0.98] transition disabled:opacity-60"
          >
            {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={3} />}
            {finishing ? "Završavam..." : "Završi trening"}
          </button>
        </div>
      </div>
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
