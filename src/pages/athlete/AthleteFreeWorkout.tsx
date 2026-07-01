import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Heart, Loader2, Check, Dumbbell } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatHMS } from "@/lib/time";
import { getHrColor } from "@/lib/workout/hrZone";
import { isHrLive } from "@/lib/liveWorkout";
import { cn } from "@/lib/utils";

// Slobodan trening (bez plana): samo timer + zivi puls + Zavrsi. Sesija ima day_id = null.
// Live HR = ISTI izvor kao ActiveWorkout (workout_live_state.current_hr preko realtime-a);
// finalize = ISTI complete_workout_session RPC. Bez vezbi/serija (volumen 0 na rezimeu).
type HRPoint = { ts: string; bpm: number };

const AthleteFreeWorkout = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const nav = useNavigate();

  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [watchHr, setWatchHr] = useState<number | null>(null);
  const [watchLastHrAt, setWatchLastHrAt] = useState<string | null>(null);
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

  // 2) Timer tik 1s.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 3) Live HR (workout_live_state.current_hr) + detekcija kraja - realtime + poll fallback
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
      if (row.current_state === "completed") goToSummary();
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

    const poll = setInterval(async () => {
      if (cancelled || finishedRef.current) return;
      const { data } = await supabase
        .from("workout_live_state")
        .select("current_hr, watch_last_hr_at, current_state")
        .eq("session_log_id", sessionId)
        .maybeSingle();
      if (data) applyLive(data);
    }, 2500);

    return () => {
      cancelled = true;
      supabase.removeChannel(liveChan);
      supabase.removeChannel(endChan);
      clearInterval(poll);
    };
  }, [sessionId, goToSummary]);

  // 4) Zavrsi: ISTA finalize logika kao ActiveWorkout (complete_workout_session sa HR
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
  const live = isHrLive(watchLastHrAt);
  const hr = live ? watchHr : null;

  return (
    <div className="h-[100dvh] overflow-y-auto bg-background">
      <div
        className="mx-auto w-full max-w-[440px] min-h-screen flex flex-col px-6"
        style={{ paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 24px)" }}
      >
        <div className="text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Slobodan trening
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-10">
          {/* Timer */}
          <div className="text-center">
            <div className="font-display text-[64px] font-bold tracking-tightest tnum leading-none">
              {formatHMS(elapsedS)}
            </div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-[0.16em] mt-2.5">
              Trajanje
            </div>
          </div>

          {/* Zivi puls (isti izvor kao ActiveWorkout header) */}
          <div
            className="inline-flex items-center gap-2.5 h-14 px-6 rounded-full bg-surface border border-hairline"
            style={{ color: hr && hr > 0 ? getHrColor(hr) : undefined }}
            aria-label="Trenutni puls"
          >
            <Heart
              className={cn("h-6 w-6", hr && hr > 0 && "animate-pulse")}
              strokeWidth={2.4}
              fill={hr && hr > 0 ? "currentColor" : "none"}
            />
            <span className="font-display text-[32px] font-bold tnum leading-none">
              {hr && hr > 0 ? hr : "-"}
            </span>
            <span className="text-[14px] font-semibold text-muted-foreground">bpm</span>
          </div>
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

export default AthleteFreeWorkout;
