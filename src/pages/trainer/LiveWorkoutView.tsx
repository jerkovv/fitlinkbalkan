import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Heart, Loader2, Activity, Pause, Flame } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui-bits";
import { QuickMessagePanel } from "@/components/trainer/QuickMessagePanel";
import { getHrColor, getZoneVar } from "@/lib/workout/hrZone";
import { isHrLive } from "@/lib/liveWorkout";

type LiveState = {
  session_log_id: string;
  athlete_id: string;
  current_exercise_idx: number | null;
  current_exercise_name: string | null;
  current_set_number: number | null;
  total_sets: number | null;
  current_hr: number | null;
  // Vreme poslednjeg HR upisa sa sata (workout_live_state.watch_last_hr_at) - prag svezine.
  watch_last_hr_at: string | null;
  total_completed_sets: number | null;
  last_heartbeat: string | null;
  current_state: string | null;
  rest_ends_at: string | null;
};

type SessionRow = {
  id: string;
  athlete_id: string;
  started_at: string;
  is_active: boolean;
  hr_series: { ts: string; bpm: number }[] | null;
};

const HrMiniChart = ({ points }: { points: { ts: string; bpm: number }[] }) => {
  if (!points.length) {
    return (
      <div className="h-20 rounded-xl bg-surface-2 flex items-center justify-center text-[12px] text-muted-foreground">
        Nema HR podataka još
      </div>
    );
  }
  const cutoff = Date.now() - 10 * 60 * 1000;
  const filtered = points.filter((p) => new Date(p.ts).getTime() >= cutoff);
  const data = filtered.length ? filtered : points.slice(-60);
  const min = Math.min(...data.map((p) => p.bpm));
  const max = Math.max(...data.map((p) => p.bpm));
  const range = Math.max(1, max - min);
  const w = 320;
  const h = 80;
  const path = data
    .map((p, i) => {
      const x = (i / Math.max(1, data.length - 1)) * w;
      const y = h - ((p.bpm - min) / range) * (h - 8) - 4;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = data[data.length - 1];
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          HR poslednjih 10 min
        </span>
        <span className="text-[11px] tnum text-muted-foreground">
          min {min} · max {max}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20" preserveAspectRatio="none">
        <path d={path} fill="none" stroke={getHrColor(last.bpm)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
};

const LiveWorkoutView = () => {
  const { athleteId } = useParams<{ athleteId: string }>();
  const { user } = useAuth();
  const nav = useNavigate();

  const [state, setState] = useState<LiveState | null>(null);
  // Broj zone (1-5) iz servera. Tabela workout_live_state nema zonu - racuna se
  // u get_active_athletes_for_trainer (puls / efektivni max iz konfiga/godina),
  // pa zonu citamo iz te RPC za ovog vezbaca. null = ne prikazuj zonu.
  const [hrZone, setHrZone] = useState<number | null>(null);
  // Zive aktivne kalorije sa sata - dolaze iz istog RPC reda kao zona
  // (get_active_athletes_for_trainer.current_active_calories), pa se osvezavaju istim refetch-om.
  const [liveCalories, setLiveCalories] = useState<number>(0);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [athleteName, setAthleteName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [ended, setEnded] = useState(false);

  const lastHrFetchRef = useRef(0);

  // Fetch athlete name
  useEffect(() => {
    if (!athleteId) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", athleteId)
        .maybeSingle();
      setAthleteName((data as any)?.full_name ?? "Vežbač");
    })();
  }, [athleteId]);

  // Fetch active session for this athlete
  const fetchSession = async () => {
    if (!athleteId) return;
    const { data } = await supabase
      .from("workout_session_logs")
      .select("id, athlete_id, started_at, is_active, hr_series")
      .eq("athlete_id", athleteId)
      .eq("is_active", true)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as any as SessionRow | null;
    if (!row) {
      setSession(null);
      setEnded(true);
    } else {
      setSession(row);
      setEnded(false);
    }
  };

  const fetchLiveState = async () => {
    if (!athleteId) return;
    const { data } = await supabase
      .from("workout_live_state" as any)
      .select("*")
      .eq("athlete_id", athleteId)
      .maybeSingle();
    setState((data as any) ?? null);
  };

  // Serverski broj zone za ovog vezbaca (ista RPC kao lista aktivnih). Server
  // racuna zonu istom logikom kao sat, pa se slazu. Osvezava se kad se promeni
  // puls (realtime) jer zona prati puls.
  const fetchZone = async () => {
    if (!athleteId) return;
    const { data } = await supabase.rpc("get_active_athletes_for_trainer" as any);
    const row = ((data as any[]) ?? []).find((r) => r.athlete_id === athleteId);
    setHrZone(row?.hr_zone ?? null);
    setLiveCalories(Math.round(row?.current_active_calories ?? 0));
  };

  useEffect(() => {
    if (!user || !athleteId) return;
    (async () => {
      await Promise.all([fetchSession(), fetchLiveState(), fetchZone()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, athleteId]);

  // Zona prati puls: kad realtime promeni current_hr, osvezi zonu sa servera.
  // Nema pulsa -> nema zone (bez RPC i bez praznog prikaza).
  useEffect(() => {
    if (state?.current_hr == null) {
      setHrZone(null);
      return;
    }
    fetchZone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.current_hr, athleteId]);

  // Realtime subscriptions
  useEffect(() => {
    if (!athleteId) return;
    const channel = supabase
      .channel(`live-state-${athleteId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workout_live_state",
          filter: `athlete_id=eq.${athleteId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setState(null);
            setEnded(true);
            return;
          }
          setState(payload.new as LiveState);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [athleteId]);

  // Periodic refresh of session (HR series every 30s)
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      if (t - lastHrFetchRef.current >= 30000) {
        lastHrFetchRef.current = t;
        fetchSession();
      }
      setNow(t);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  const elapsedMs = useMemo(() => {
    if (!session?.started_at) return 0;
    return now - new Date(session.started_at).getTime();
  }, [now, session]);

  const elapsedLabel = useMemo(() => {
    const total = Math.max(0, Math.floor(elapsedMs / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [elapsedMs]);

  if (loading) {
    return (
      <div className="h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (ended || !session) {
    return (
      <div className="h-[100dvh] overflow-y-auto bg-background">
        <div className="mx-auto w-full max-w-[440px] min-h-screen px-6 pt-12 space-y-5">
          <button
            onClick={() => nav(-1)}
            className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-2 transition"
            aria-label="Nazad"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <Card className="p-6 text-center space-y-3">
            <Activity className="h-8 w-8 mx-auto text-muted-foreground/60" strokeWidth={1.5} />
            <div className="text-[18px] font-bold tracking-tight">Trening završen</div>
            <div className="text-[13px] text-muted-foreground">
              {athleteName} više ne trenira.
            </div>
            <Link
              to={`/trener/vezbaci/${athleteId}`}
              className="inline-flex items-center justify-center h-11 px-5 rounded-2xl bg-gradient-brand text-white text-[14px] font-semibold shadow-brand"
            >
              Otvori profil vežbača
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  const hr = state?.current_hr ?? null;
  // Prag svezine (deljen sa listom): puls se prikazuje samo ako ga je sat osvezio u
  // poslednjih HR_FRESH_SECONDS. `now` tika 1s pa se gejt re-evaluira i bez novog fetch-a.
  const hrLive = isHrLive(state?.watch_last_hr_at ?? null);
  // Boja iz FitLink rampe (brand tokeni) kad imamo serversku zonu; inace
  // fallback na puls-baziranu boju. Bez hardkodiranog hex-a.
  const zoneVar = getZoneVar(hrZone);
  const hrColor = zoneVar ? `hsl(var(${zoneVar}))` : getHrColor(hr);
  const hrColorSoft =
    hr != null && hr > 0
      ? zoneVar
        ? `hsl(var(${zoneVar}) / 0.1)`
        : `${getHrColor(hr)}1A`
      : undefined;

  // Odmor: odbrojavanje iz rest_ends_at sa servera, tika svake sekunde preko
  // `now` (isti tick kao stoperica). Kad istekne (<=0) tretiramo kao aktivno -
  // server takodje vrati current_state na active. Smirena sky boja iz tokena.
  const restEndsMs = state?.rest_ends_at ? new Date(state.rest_ends_at).getTime() : null;
  const restRemainingMs = restEndsMs != null ? restEndsMs - now : 0;
  const isResting = state?.current_state === "rest" && restRemainingMs > 0;
  const restLabel = (() => {
    const total = Math.max(0, Math.ceil(restRemainingMs / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  })();

  return (
    <div className="h-[100dvh] overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-[440px] min-h-screen relative pb-24">
        {/* Header */}
        <div
          className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-hairline"
          style={{ paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 8px)" }}
        >
          <div className="px-4 pb-3 flex items-center gap-3">
            <button
              onClick={() => nav(-1)}
              aria-label="Nazad"
              className="h-10 w-10 rounded-full bg-surface border border-hairline flex items-center justify-center"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {isResting ? (
                  <>
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: "hsl(var(--session-sky-fg))" }}
                    />
                    <span
                      className="text-[10px] font-bold uppercase tracking-[0.16em]"
                      style={{ color: "hsl(var(--session-sky-fg))" }}
                    >
                      Na odmoru
                    </span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-success-soft-foreground">
                      Trenira sad
                    </span>
                  </>
                )}
              </div>
              <div className="text-[15px] font-bold leading-tight truncate">{athleteName}</div>
            </div>
            <div className="text-[13px] font-semibold tnum text-muted-foreground">
              {elapsedLabel}
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 space-y-4">
          {/* Odmor: jasna ali smirena oznaka sa odbrojavanjem (sky tokeni). */}
          {isResting && (
            <div
              className="rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ background: "hsl(var(--session-sky-bg))" }}
            >
              <div
                className="h-11 w-11 rounded-xl inline-flex items-center justify-center shrink-0"
                style={{ background: "hsl(var(--session-sky-fg) / 0.12)" }}
              >
                <Pause
                  className="h-5 w-5"
                  strokeWidth={2.4}
                  fill="currentColor"
                  style={{ color: "hsl(var(--session-sky-fg))" }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="text-[10px] font-bold uppercase tracking-[0.16em]"
                  style={{ color: "hsl(var(--session-sky-fg))" }}
                >
                  Odmor
                </div>
                <div className="text-[13px] text-muted-foreground leading-tight">
                  Vežbač se odmara
                </div>
              </div>
              <div
                className="font-display text-[28px] font-bold tracking-tight tnum leading-none"
                style={{ color: "hsl(var(--session-sky-fg))" }}
              >
                {restLabel}
              </div>
            </div>
          )}

          {/* Hero card: current exercise */}
          <Card className="p-5 space-y-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Trenutna vežba
            </div>
            <div className="font-display text-[24px] font-bold tracking-tighter leading-tight">
              {state?.current_exercise_name ?? "Priprema..."}
            </div>
            <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
              <span>
                Serija{" "}
                <span className="font-semibold text-foreground tnum">
                  {state?.current_set_number ?? 1}
                </span>
                {state?.total_sets ? (
                  <>
                    {" "}
                    od <span className="font-semibold text-foreground tnum">{state.total_sets}</span>
                  </>
                ) : null}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span>
                <span className="font-semibold text-foreground tnum">
                  {state?.total_completed_sets ?? 0}
                </span>{" "}
                ukupno serija
              </span>
            </div>
          </Card>

          {/* PULS / KALORIJE - identican stat par (grid 2 kolone): obe vrednosti iste
              velicine (text-4xl), tabular, jedinica na baseline-u. Card je zona-tintovan. */}
          <div
            className="card-premium p-5 transition-colors"
            style={{ background: hrColorSoft }}
          >
            <div className="grid grid-cols-2 gap-4">
              {/* PULS */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Heart
                    className="h-4 w-4"
                    strokeWidth={2.4}
                    fill="currentColor"
                    style={{ color: hr != null && hr > 0 && hrLive ? hrColor : "hsl(var(--muted-foreground))" }}
                  />
                  Puls
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-4xl font-bold tracking-tightest leading-none tnum">
                    {hr != null && hr > 0 && hrLive ? hr : "-"}
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground">bpm</span>
                </div>
                {hrZone != null && zoneVar && (
                  <div
                    className="text-[12px] font-semibold"
                    style={{ color: `hsl(var(${zoneVar}))` }}
                  >
                    Zona {hrZone}
                  </div>
                )}
              </div>

              {/* KALORIJE - ista forma kao PULS (uvek vidljivo, 0 kad nema podatka) */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Flame className="h-4 w-4 text-muted-foreground" strokeWidth={2.4} />
                  Kalorije
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-4xl font-bold tracking-tightest leading-none tnum">
                    {Math.round(liveCalories ?? 0)}
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground">kcal</span>
                </div>
              </div>
            </div>
          </div>

          {/* HR mini chart */}
          <HrMiniChart points={(session.hr_series as any) ?? []} />

          {/* Quick messages */}
          <Card className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
              Pošalji poruku
            </div>
            <QuickMessagePanel sessionId={session.id} />
          </Card>
        </div>
      </div>
    </div>
  );
};

export default LiveWorkoutView;
