import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, X, Check, ChevronRight, MessageCircle, Heart, Dumbbell, WifiOff, Plus, Minus } from "lucide-react";
import { getHrColor, getHrZone } from "@/lib/workout/hrZone";
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ExerciseHeader } from "@/components/workout/ExerciseHeader";
import { SetLogger } from "@/components/workout/SetLogger";
import { RestTimer } from "@/components/workout/RestTimer";
import { Network } from "@capacitor/network";
import { Capacitor, registerPlugin } from "@capacitor/core";

// ---- Nativni Live Activity plugin (iOS-only: lock screen / Dynamic Island) ----
// Most ka nativnom LiveActivityPlugin-u ("LiveActivity": start/update/end). Na
// ne-iOS platformi ili ako plugin / iOS verzija nije podrzana, sve je no-op
// (try/catch + platforma guard) - ne rusi web/Android.
type LiveActivityFields = {
  exerciseName: string;
  setNumber: number;
  totalSets: number;
  heartRate?: number;
  hrZone: string;            // rest/easy/moderate/hard/max (isti kao nativni helper)
  isResting: boolean;
  restEndsAtMs?: number;
  isDurationBased: boolean;
  durationMinutes?: number;
  watchConnected: boolean;   // sat prisutan -> native prikazuje puls
  thumbnailUrl?: string;     // URL slike vezbe (native kesira u App Group)
};
interface LiveActivityPluginDef {
  start(options: LiveActivityFields & { athleteName: string; workoutStartedAtMs: number }): Promise<{ success: boolean }>;
  update(options: LiveActivityFields): Promise<{ success: boolean }>;
  end(): Promise<{ success: boolean }>;
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

// Cilj jednog seta iz get_workout_day_full.set_details (izvor istine, per-set).
// reps je sirov tekst (npr "8" ili "8-12"), weight/rest broj ili null.
type SetDetail = {
  set_number: number;
  reps: string | null;
  weight_kg: number | null;
  rest_seconds: number | null;
};
type DayExercise = {
  id: string;
  position: number;
  sets: number;
  reps: number | null;
  weight_kg: number | null;
  rest_seconds: number | null;
  // Vezbe trcanja/hodanja (exercise.is_duration_based): prikaz u minutima.
  duration_minutes: number | null;
  // Per-set ciljevi (prazno za stare programe pre per-set -> fallback na sets/reps/weight_kg).
  set_details: SetDetail[] | null;
  exercise_id: string;
  exercise: {
    name: string;
    name_en: string | null;
    primary_muscle: string | null;
    video_url: string | null;
    thumbnail_url: string | null;
    instructions: string | null;
    is_duration_based: boolean | null;
  };
};

// Cilj za odredjeni set (1-based): iz set_details kad postoji, inace fallback na stari
// parent (jedna vrednost za sve setove). reps (broj) za stepper prefil; repsText za prikaz.
const targetForSet = (
  ex: DayExercise,
  setNum: number,
): { reps: number | null; weight: number | null; repsText: string | null; rest: number | null } => {
  const sd = ex.set_details?.find((s) => s.set_number === setNum);
  if (sd) {
    const repsNum = sd.reps != null && /^\d+/.test(sd.reps.trim()) ? parseInt(sd.reps, 10) : null;
    return {
      reps: repsNum,
      weight: sd.weight_kg,
      repsText: sd.reps ?? (repsNum != null ? String(repsNum) : null),
      rest: sd.rest_seconds ?? ex.rest_seconds,   // per-set pauza, fallback na parent
    };
  }
  return { reps: ex.reps, weight: ex.weight_kg, repsText: ex.reps != null ? String(ex.reps) : null, rest: ex.rest_seconds };
};

type DayFull = {
  day_id: string;
  day_number: number;
  day_name: string;
  assigned_program_id: string;
  exercises: DayExercise[];
};

type CompletedSet = {
  exerciseIndex: number;
  setNumber: number;
  reps: number;
  weight_kg: number;
};

type HRPoint = { ts: string; bpm: number };

// Pozicija treninga = JEDINI izvor istine za prikaz. Dolazi iz athlete_poll_state
// (server motor). Telefon je ČITAČ: ne upisuje poziciju, samo zove engine RPC-ove
// i renderuje ono što server vrati. Optimistički lokalni prikaz je samo radi
// brzine; poll je korektor.
type WorkoutPos = {
  exerciseIdx: number;
  setNumber: number;
  totalSets: number;
  state: "active" | "rest" | "completed";
  // Apsolutni kraj odmora u KLIJENTSKOM epoch ms (server-abs umanjen za clock offset).
  restEndsAtMs: number | null;
  // Početak treninga, SERVER epoch ms. Proteklo vreme se računa od servera, ne lokalno.
  startedAtMs: number | null;
  currentHr: number | null;
};

const triggerHaptic = async () => {
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(60);
    }
  }
};

const fmtElapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// Mrezni poziv na tek-probudenoj vezi zna da visi 15-30s (OS TCP timeout). withTimeout
// odbaci posle ms, pa pozivalac moze brzo da retrira umesto da blokira UI.
function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

// Postgres timestamptz preko realtime-a zna da stigne kao "2026-06-22 13:05:57.12+00"
// (razmak umesto 'T', offset "+00" umesto "+00:00"). Safari/WKWebView Date.parse je
// strog i to ume da vrati NaN -> normalizujemo u ISO pre parsiranja. Vraca server
// epoch ms (NE klijent - pozivalac oduzme clockOffset), ili null ako ne uspe.
function pgTsToMs(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let s = raw.trim().replace(" ", "T");
  const off = s.match(/([+-])(\d{2})(?::?(\d{2}))?$/);   // "+00" / "+0000" / "+02:00"
  if (off) s = s.slice(0, off.index) + `${off[1]}${off[2]}:${off[3] ?? "00"}`;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

// Watch presence pragovi (FAZA 1): sat upisuje watch_last_hr_at svakih ~5s dok radi.
// FRESH = jos povezan; preko FRESH (a watch_last_hr_at != null) = izgubljen -> zakljucaj.
// ESCAPE = posle ovoliko nudimo "Nastavi na telefonu" (da ne ostane zaglavljeno ako sat crkne).
const WATCH_FRESH_MS = 15000;
const WATCH_ESCAPE_MS = 60000;

// Realtime pozicija: koliko dugo POSLE korisnicke akcije optimisticki prikaz ima
// prednost nad realtime payload-om (da zakasneli pred-akcijski event ne vrati prikaz
// na staro). Poll (2s) je korektor posle isteka. Vazi samo za telefonove SOPSTVENE
// akcije; watch-driven izmene (telefon zakljucan, bez akcija) prolaze instant.
const RT_POS_GUARD_MS = 1500;

const ActiveWorkout = () => {
  const { dayId } = useParams<{ dayId: string }>();
  const { user } = useAuth();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  // Greska pri ucitavanju dana / pokretanju sesije -> prikazi poruku, ne spinner.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [day, setDay] = useState<DayFull | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  // Pozicija iz servera (poll). null dok prvi poll ne stigne.
  const [pos, setPos] = useState<WorkoutPos | null>(null);

  // Lokalni log serija — SAMO za labele u listi serija (best-effort, optimistički).
  // NIJE izvor pozicije; markeri "urađeno" se izvode iz pos.setNumber.
  const [completedSets, setCompletedSets] = useState<CompletedSet[]>([]);
  const [finishing, setFinishing] = useState(false);
  // Kraj treninga (finish/poslednji set/cancel). Kad je true: poll i heartbeat se
  // GASE (effect teardown), i init NE sme više da zove start_workout_session.
  const [finished, setFinished] = useState(false);
  // Prelaz na rezime (samo finish-to-summary putanje, NE cancel): prikazuje brendiran
  // "Zavrsavam trening..." umesto belog spinnera dok finalizeAndNav radi i navigira.
  const [finishingToSummary, setFinishingToSummary] = useState(false);
  // Failsafe: ako prelaz ne razresi za ~7s, brendiran ekran NIJE terminalan -> error+retry.
  const [finishError, setFinishError] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  // Live HR (lokalni HealthKit stream na telefonu)
  const [liveHr, setLiveHr] = useState<number | null>(null);
  // Zivi HR sa SATA preko realtime live-state (workout_live_state.current_hr). Instant izvor
  // kad sat vozi trening - bez cekanja 2s poll-a. Poll (pos.currentHr) ostaje fallback.
  const [watchHr, setWatchHr] = useState<number | null>(null);

  // Kardio (is_duration_based): stepper Minuti za tekucu vezbu (init iz plana ili 20) +
  // busy guard da "Zavrsi vezbu" ne okine dvaput dok RPC traje.
  const [cardioMinutes, setCardioMinutes] = useState(20);
  const [cardioBusy, setCardioBusy] = useState(false);

  // FAZA 1 - watch presence: NE parsiramo serverski timestamp (new Date(string) u WKWebView
  // daje pogresno/starije vreme + clock skew -> lazni lock). Umesto toga: PROMENA stringa
  // watch_last_hr_at = signal "sat se javio", a svezinu merimo telefonskim Date.now().
  const lastSeenWatchTsRef = useRef<string | null>(null);   // poslednja vidjena vrednost
  const watchSignalLocalRef = useRef<number | null>(null);  // Date.now() kad se PROMENILA
  // Reaktivni mirror "sat se IKAD javio u ovoj sesiji" (== watchSignalLocalRef.current != null).
  // State (ne ref) da se lock/baner preracunaju ODMAH kad sat prvi put javi, ne tek na 1s tik.
  const [watchEverPresent, setWatchEverPresent] = useState(false);
  // Trener je izabrao "Nastavi na telefonu" -> otkljucaj do kraja sesije.
  const [phoneTakeover, setPhoneTakeover] = useState(false);
  // Sinhroni ref za gejtovanje mutacija u handlerima (bez stale closure-a).
  const controlsLockedRef = useRef(false);

  // Offline indikator: telefon nema internet -> trening se ne cuva dok se veza ne vrati.
  // Pravi izvor je @capacitor/network (navigator.onLine je nepouzdan u WKWebView).
  // Optimisticki true; Network.getStatus() koriguje na mount.
  const [isOnline, setIsOnline] = useState<boolean>(true);
  // Reconnect: bump-uje resubscribe realtime kanala (live-state, session-end).
  const [realtimeEpoch, setRealtimeEpoch] = useState(0);
  // Ref na poll funkciju (definisana u poll effektu) - da je reconnect/online forsira odmah.
  const pollRef = useRef<(() => void) | null>(null);
  // Sinhroni mirror isOnline (za RPC catch bez stale closure-a / bez deps po handleru).
  const isOnlineRef = useRef(true);
  const hrSeriesRef = useRef<HRPoint[]>([]);

  // Wake lock
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // --- Reader plumbing ---
  // Clock offset = server_now_ms - client Date.now(). Primenjuje se na rest_ends_at_ms
  // da skew sata uređaja ne pokvari preostalo vreme.
  const clockOffsetRef = useRef(0);
  // Staleness brana: ako optimistička akcija krene POSLE nego što je poll započeo,
  // odgovor tog poll-a se odbacuje (ne sme da vrati prikaz na staro server stanje).
  const lastActionAtRef = useRef(0);
  // Da li smo ikad videli živ trening (da null poll na startu ne odvede u "završeno").
  const sawWorkoutRef = useRef(false);
  // Štit: kad smo već krenuli na "završeno", ignoriši poll i ne navigiraj dvaput.
  const finishedRef = useRef(false);
  // Init guard: start_workout_session sme TAČNO jednom po ulasku u ekran. Sprečava
  // dupli start na re-render/dep promenu (npr. nova referenca user-a).
  const initRef = useRef(false);
  // Da posle unmount-a ne diramo state iz in-flight init-a.
  const unmountedRef = useRef(false);
  // Ref na poziciju za stabilne handlere (watch eventi).
  const posRef = useRef<WorkoutPos | null>(null);
  useEffect(() => { posRef.current = pos; }, [pos]);

  // Live Activity (iOS): start se okida JEDNOM po sesiji; throttle za update
  // (strukturni kljuc + delta pulsa + max 1x/5s) da ne spamuje na svaki tik.
  const liveActivityStartedRef = useRef(false);
  const laLastKeyRef = useRef<string>("");
  const laLastHrRef = useRef<number | null>(null);
  const laLastSentAtRef = useRef(0);

  // Jedinstveni prelaz u "završeno": sinhroni ref (za async zatvaranja) + state
  // (da poll/heartbeat effekti urade teardown i prestanu da rade ODMAH).
  const markFinished = useCallback(() => {
    finishedRef.current = true;
    setFinished(true);
  }, []);

  // DETEKTOVAN vec-zavrsen kraj (poll null / realtime is_active=false / foreground
  // provera): sesija je VEC finalizovana na serveru (sat) -> NE zovi
  // complete_workout_session (to je ono sto visi na tek-uspostavljenoj vezi), samo
  // navigiraj direktno na rezime. Samo JEDAN zavrsetak prolazi (finishedRef guard).
  const goToSummary = useCallback((sid: string | null) => {
    if (finishedRef.current) return;
    markFinished();
    if (!sid) {
      nav("/vezbac/trening", { replace: true });
      return;
    }
    setFinishingToSummary(true);
    nav(`/vezbac/trening/zavrsen/${sid}`, { replace: true });
  }, [nav, markFinished]);

  useEffect(() => {
    return () => { unmountedRef.current = true; };
  }, []);

  // Failsafe za brendiran prelaz: ako se za ~7s ne navigira (komponenta jos mountovana),
  // prikazi error+retry umesto beskonacnog "Zavrsavam trening...".
  useEffect(() => {
    if (!finishingToSummary) return;
    const t = setTimeout(() => {
      setFinishError(true);
    }, 7000);
    return () => clearTimeout(t);
  }, [finishingToSummary]);

  // Prati internet vezu telefona preko @capacitor/network (pouzdan u WKWebView).
  // Kad nema veze, akcije/cuvanje ne prolaze -> prikazi banner; kad se vrati, sakrij.
  useEffect(() => {
    let handle: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const status = await Network.getStatus();
      if (cancelled) return;
      setIsOnline(status.connected);
      const h = await Network.addListener("networkStatusChange", (st) => {
        setIsOnline(st.connected);
      });
      if (cancelled) { h.remove(); return; }
      handle = h;
    })();
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, []);

  // Ref na sessionId za async provere (resume/poll) bez zavisnosti u callback-ovima.
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);

  // Ako je sesija vec zatvorena na serveru (npr. zavrsena na satu dok je telefon
  // spavao/ubijen), idi pravo na rezime umesto da visimo na ekranu treninga.
  const navIfSessionDone = useCallback(async (sid: string | null): Promise<boolean> => {
    if (!sid || finishedRef.current) return false;
    // Samo ako smo videli zivu sesiju (vezbac je bio u toku treninga). Inace bi
    // staru zavrsenu sesiju bacalo na rezime cim vezbac udje da je ponovo odradi.
    if (!sawWorkoutRef.current) return false;
    let data: any = null;
    try {
      // withTimeout: brz check, da viseci zahtev na budjenju ne drzi proveru 15-30s.
      const res = await withTimeout(
        supabase.from("workout_session_logs").select("is_active").eq("id", sid).maybeSingle(),
        3500
      );
      data = res.data;
    } catch {
      return false; // timeout/mreza -> sledeci poll/foreground/online ce probati ponovo
    }
    if (unmountedRef.current) return false;
    if (data && (data as any).is_active === false) {
      // Vec finalizovano -> direktno na rezime, BEZ complete_workout_session.
      goToSummary(sid);
      return true;
    }
    return false;
  }, [goToSummary]);

  // Cim se veza vrati (isOnline false->true), ODMAH proveri da li je sesija zavrsena na
  // serveru (sat zavrsio offline) -> rezime, bez cekanja sledeceg poll tika. Brz check
  // (withTimeout u navIfSessionDone). Foreground povratak je pokriven onVis u poll effektu.
  useEffect(() => {
    if (isOnline && sessionId && !finished) {
      void navIfSessionDone(sessionIdRef.current);   // brzi kraj-sesije check
      pollRef.current?.();                            // ODMAH osvezi POZICIJU (ne cekaj 2s tik)
      setRealtimeEpoch((e) => e + 1);                 // resubscribe realtime kanale (ne cekaj auto-reconnect)
    }
  }, [isOnline, sessionId, finished, navIfSessionDone]);

  /* ------------------------- Init: start session + load day ------------------------- */
  useEffect(() => {
    if (!dayId || !user) return;
    // TAČNO jednom: nikad ponovo na re-render, dep promenu, ni posle završetka.
    if (initRef.current || finishedRef.current) return;
    initRef.current = true;

    (async () => {
      setLoading(true);

      const { data: dayRaw, error: dayErr } = await supabase.rpc(
        "get_workout_day_full",
        { p_day_id: dayId } as any
      );
      if (unmountedRef.current) return;
      if (dayErr || !dayRaw) {
        setLoadError(dayErr?.message ?? "Trening nije pronađen");
        setLoading(false);
        return;
      }
      const dayData = (Array.isArray(dayRaw) ? dayRaw[0] : dayRaw) as DayFull;
      if (!dayData) {
        setLoadError("Trening nije pronađen");
        setLoading(false);
        return;
      }
      // Legitiman prazan dan (0 aktivnih vezbi - soft-delete ili custom dan bez
      // dodatih vezbi): NE pokrecemo sesiju; render pokazuje uredan prazan state.
      if (!dayData.exercises?.length) {
        setDay(dayData);
        setLoading(false);
        return;
      }
      setDay(dayData);

      // start_workout_session sam resava: ako za ovaj dan postoji ZIVA sesija ->
      // vrati je (resume + re-seed zivog reda); inace pokrene NOVU. Klik na dan =
      // nov trening cak i za vec zavrsen dan. NE navigiramo na rezime na osnovu
      // stare zavrsene sesije (to je ranije gresno bacalo na rezime).
      // Takodje seed-uje pocetni zivi red, pa prvi athlete_poll_state vraca trening.
      const { data: sid, error: startErr } = await supabase.rpc(
        "start_workout_session",
        {
          p_assigned_program_id: dayData.assigned_program_id,
          p_day_id: dayData.day_id,
        } as any
      );
      if (unmountedRef.current) return;
      if (startErr || !sid) {
        setLoadError(startErr?.message ?? "Ne mogu da pokrenem trening");
        setLoading(false);
        return;
      }
      setSessionId(sid as unknown as string);
      setLoading(false);
    })();
  }, [dayId, user]);

  /* ------------------------- Elapsed clock (tick; vreme se računa od servera) ------------------------- */
  useEffect(() => {
    if (!sessionId) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [sessionId]);

  /* ------------------------- Wake lock ------------------------- */
  useEffect(() => {
    let released = false;
    const acquire = async () => {
      try {
        const anyNav = navigator as any;
        if (anyNav.wakeLock?.request) {
          const lock = await anyNav.wakeLock.request("screen");
          if (released) {
            lock.release?.();
            return;
          }
          wakeLockRef.current = lock;
        }
      } catch {
        /* noop */
      }
    };
    acquire();
    const onVis = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current) acquire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVis);
      wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
    };
  }, []);

  /* ------------------------- Live HR (push/subscribe) ------------------------- */
  useEffect(() => {
    if (!sessionId) return;

    let cleanup: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      const { startLiveHRMonitoring } = await import("@/lib/wearable/healthkit");
      if (cancelled) return;

      cleanup = await startLiveHRMonitoring((bpm) => {
        setLiveHr(bpm);
        hrSeriesRef.current.push({ ts: new Date().toISOString(), bpm });
      });
    })();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [sessionId]);

  /* ------------------------- Trainer messages (incoming) ------------------------- */
  type TrainerMessage = {
    id: string;
    message: string;
    message_type: "text" | "encouragement" | "warning" | string;
    sent_at: string;
  };
  const [incomingMessage, setIncomingMessage] = useState<TrainerMessage | null>(null);

  useEffect(() => {
    if (!user || !sessionId) return;
    const channel = supabase
      .channel(`live-msg:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "workout_live_messages",
          filter: `session_log_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (!row || row.athlete_id !== user.id) return;
          const msg: TrainerMessage = {
            id: row.id,
            message: row.message,
            message_type: row.message_type ?? "text",
            sent_at: row.sent_at ?? new Date().toISOString(),
          };
          setIncomingMessage(msg);
          triggerHaptic();
          supabase
            .from("workout_live_messages" as any)
            .update({ read_at: new Date().toISOString() } as any)
            .eq("id", row.id)
            .then(() => undefined);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, sessionId]);

  // Auto-dismiss banner after 8s
  useEffect(() => {
    if (!incomingMessage) return;
    const id = setTimeout(() => setIncomingMessage(null), 8000);
    return () => clearTimeout(id);
  }, [incomingMessage]);

  /* ------------------------- Derived ------------------------- */
  const exercises = day?.exercises ?? [];
  const current = pos ? exercises[pos.exerciseIdx] : undefined;
  const totalSetsAll = useMemo(
    () => exercises.reduce((acc, e) => acc + (e.sets ?? 0), 0),
    [exercises]
  );
  // Ukupno urađenih serija = sve serije vežbi pre tekuće + (setNumber - 1) tekuće.
  const completedTotal = useMemo(() => {
    if (!pos || !day) return 0;
    let sum = 0;
    for (let i = 0; i < pos.exerciseIdx; i++) sum += day.exercises[i]?.sets ?? 0;
    sum += Math.max(0, pos.setNumber - 1);
    return sum;
  }, [pos, day]);
  // Proteklo vreme se računa od SERVERA: serverNow (= now + clockOffset) − started_at_ms.
  // Bez lokalnog startedAt-a, pa remount/otključavanje ne resetuje brojač.
  const elapsedMs = pos?.startedAtMs
    ? Math.max(0, now.getTime() + clockOffsetRef.current - pos.startedAtMs)
    : 0;

  const initialFor = (exIndex: number, setNum: number) => {
    const found = completedSets.find(
      (c) => c.exerciseIndex === exIndex && c.setNumber === setNum
    );
    return found ? { reps: found.reps, weight_kg: found.weight_kg } : null;
  };

  // Kardio: kad tekuca vezba postane is_duration_based, inicijalizuj stepper iz plana
  // (duration_minutes) ili 20. Zavisi od exerciseIdx -> re-init na prelazu na sledecu
  // vezbu; NE resetuje se na obican re-render (poll), pa korisnikovo podesavanje ostaje.
  useEffect(() => {
    if (current?.exercise.is_duration_based) {
      setCardioMinutes(current.duration_minutes ?? 20);
    }
  }, [pos?.exerciseIdx, current?.exercise.is_duration_based, current?.duration_minutes]);

  /* ------------------------- Finalizacija (HR statistika + nav) ------------------------- */
  // Engine (athlete_complete_set zadnje serije / athlete_finish_workout) već zatvara
  // sesiju i živi red na serveru. Ovde SAMO zakačimo HR statistiku (avg/max/series)
  // koju motor ne računa, pa navigiramo. complete_workout_session je idempotentan.
  const finalizeAndNav = useCallback(async () => {
    // Nevalidan sessionId -> ne idi na /zavrsen/undefined; idi na trening listu.
    if (!sessionId) {
      nav("/vezbac/trening", { replace: true });
      return;
    }
    // Brendiran prelazni ekran ("Zavrsavam trening...") umesto belog spinnera.
    setFinishingToSummary(true);

    const series = hrSeriesRef.current;
    const bpms = series.map((p) => p.bpm).filter((n) => Number.isFinite(n));
    const avg = bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : null;
    const max = bpms.length ? Math.max(...bpms) : null;
    const min = bpms.length ? Math.min(...bpms) : null;

    // complete_workout_session sa timeout-om: ako visi (tek-uspostavljena veza), svejedno
    // navigiramo posle ~4s. Navigacija se desava u SVAKOM slucaju (i na gresci/timeout-u).
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
      return "ok" as const;
    })();
    const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 4000));
    try {
      await Promise.race([rpc, timeout]);
    } catch {
      // timeout/greska: svejedno navigiramo na rezime (read-only ekran).
    }
    nav(`/vezbac/trening/zavrsen/${sessionId}`, { replace: true });
  }, [sessionId, nav]);

  /* ------------------------- Zajednicka primena pozicije (poll + realtime) ------------------------- */
  // Jedna tacka istine za upis u `pos`. Zovu je i applyPoll (HTTP, 2s) i live-state
  // realtime handler, da se ponasaju IDENTICNO (isti fallback-ovi). restEndsAtMs MORA
  // vec biti u KLIJENT epohu (serverMs - clockOffset), kao i do sad u applyPoll.
  const applyPosition = useCallback(
    (n: {
      exerciseIdx: number | null | undefined;
      setNumber: number | null | undefined;
      totalSets: number | null | undefined;
      state: unknown;
      restEndsAtMs: number | null;
      startedAtMs: number | null;
      currentHr: number | null;
    }) => {
      setPos({
        exerciseIdx: n.exerciseIdx ?? 0,
        setNumber: n.setNumber ?? 1,
        totalSets: n.totalSets ?? 1,
        state: (n.state as WorkoutPos["state"]) ?? "active",
        restEndsAtMs: n.restEndsAtMs,
        startedAtMs: n.startedAtMs,
        currentHr: n.currentHr,
      });
    },
    []
  );

  /* ------------------------- Poll: athlete_poll_state (render iz servera) ------------------------- */
  const applyPoll = useCallback(
    (workout: any, serverNowMs: number | null | undefined) => {
      if (finishedRef.current) return;
      if (typeof serverNowMs === "number") {
        clockOffsetRef.current = serverNowMs - Date.now();
      }

      if (!workout) {
        // Nema živog reda. Navigiraj na rezime SAMO ako smo videli živu sesiju
        // (završena DOK je vežbač u ActiveWorkout - ovde ili na satu). Ako još
        // nismo videli živu (vežbač tek ušao / seed nije stigao), NE navigiraj na
        // rezime - pusti normalan tok (init je pokrenuo novu sesiju).
        if (sawWorkoutRef.current) {
          // Vec-zavrsen (sat/telefon) -> direktna navigacija, BEZ complete_workout_session.
          goToSummary(sessionIdRef.current);
        }
        return;
      }

      sawWorkoutRef.current = true;

      // Watch presence + HR i iz POLL-a (HTTP), NE samo iz realtime-a. Realtime WebSocket
      // posle pada neta zna da ostane mrtav (resubscribe ne pomaze) -> presence se zamrzne ->
      // trajni lazni "IZGUBLJEN SIGNAL" lock dok app nije ubijena. Poll (athlete_poll_state)
      // se pouzdano oporavi posle neta i odrzava presence/HR svake ~2s. SOLO: watch_last_hr_at
      // je null -> signal se nikad ne postavi -> watchWasPresent=false -> nikad lock.
      //
      // VAZNO: poll vraca TEKUCU vrednost svaki put (za razliku od realtime-a koji fire-uje
      // samo na PROMENE). Zato prva opservacija = SAMO baseline (kao initial-read live-state
      // efekta) - ne postavlja signal, da sat koji je otisao PRE otvaranja ne deluje svez i ne
      // okine lazni lock posle 15s. Signal/presence se postavlja tek na NAREDNU promenu stringa.
      // Recovery posle pada neta nije pogodjen: tada je lastSeenWatchTsRef vec popunjen, pa nov
      // string odmah osvezi svezinu.
      const pollWatchRaw = workout?.watch_last_hr_at ?? null;
      if (pollWatchRaw) {
        if (lastSeenWatchTsRef.current == null) {
          lastSeenWatchTsRef.current = pollWatchRaw;          // baseline only, bez signala
        } else if (pollWatchRaw !== lastSeenWatchTsRef.current) {
          lastSeenWatchTsRef.current = pollWatchRaw;
          watchSignalLocalRef.current = Date.now();
          setWatchEverPresent(true);
        }
      }
      const pollHr = workout?.current_hr;
      if (typeof pollHr === "number" && pollHr > 0) setWatchHr(pollHr);

      const serverRestMs =
        typeof workout.rest_ends_at_ms === "number" ? workout.rest_ends_at_ms : null;
      const restEndsAtMs =
        serverRestMs != null ? serverRestMs - clockOffsetRef.current : null;

      applyPosition({
        exerciseIdx: workout.current_exercise_idx,
        setNumber: workout.current_set_number,
        totalSets: workout.total_sets,
        state: workout.current_state,
        restEndsAtMs,
        startedAtMs:
          typeof workout.started_at_ms === "number" ? workout.started_at_ms : null,
        currentHr: typeof workout.current_hr === "number" ? workout.current_hr : null,
      });
    },
    [goToSummary, applyPosition]
  );

  useEffect(() => {
    if (!sessionId || finished) return;
    let stopped = false;
    let inFlight = false;

    const poll = async () => {
      if (finishedRef.current || inFlight) return;
      inFlight = true;
      const startedTs = Date.now();
      try {
        // withTimeout 3.5s: viseci prvi-posle-budjenja zahtev abortira, interval (2s)
        // retrira cim je radio spreman -> detekcija za par sekundi, ne 15-30s.
        const { data, error } = await withTimeout(supabase.rpc("athlete_poll_state"), 3500);
        if (stopped) return;
        if (error) return; // zadrži poslednje stanje
        // Staleness: novija optimistička akcija je krenula POSLE starta ovog poll-a.
        if (lastActionAtRef.current > startedTs) return;
        const res = data as any;
        if (!res || res.success === false) return;
        applyPoll(res.workout, res.server_now_ms);
      } catch {
        // timeout / mreza -> preskoci, sledeci tik retrira
      } finally {
        inFlight = false;
      }
    };

    pollRef.current = () => { void poll(); };   // reconnect/online forsira odmah jedan poll
    poll();
    const id = setInterval(poll, 2000);
    const onVis = () => {
      // Na povratak u foreground: prvo proveri da li je sesija zatvorena (npr.
      // zavrsena na satu dok je telefon spavao) -> rezime; pa onda poll.
      if (document.visibilityState === "visible") {
        // GRACE: dok je app bio u pozadini, realtime/poll su pauzirani -> watch signal
        // zastari -> posle 15s lazni watch-lost lock. Osvezi svezinu SAMO ako je sat vec
        // bio prisutan (NE postavljaj na SOLO - to bi lazno reklo "sat prisutan"). Sledeci
        // pravi watch_last_hr_at potvrdjuje; ako sata stvarno nema, posle 15s opet lock.
        if (watchSignalLocalRef.current != null) {
          watchSignalLocalRef.current = Date.now();
        }
        void navIfSessionDone(sessionIdRef.current).then((done) => {
          if (!done) poll();
        });
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stopped = true;
      pollRef.current = null;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [sessionId, finished, applyPoll, navIfSessionDone]);

  /* ------------------------- Realtime: brza detekcija kraja sesije ------------------------- */
  // workout_session_logs je u realtime publikaciji. Kad sat zavrsi trening (npr offline
  // pa se poveze), is_active -> false stigne ODMAH preko realtime-a, bez cekanja na poll
  // (2s) -> brzi prelaz na rezime. Poll ostaje kao fallback.
  useEffect(() => {
    if (!sessionId || finished) return;
    const channel = supabase
      .channel(`session-end:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "workout_session_logs", filter: `id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as any;
          if (row && row.is_active === false && !finishedRef.current && sawWorkoutRef.current) {
            // Vec finalizovano na serveru -> direktno na rezime, BEZ complete RPC.
            goToSummary(sessionId);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, finished, goToSummary, realtimeEpoch]);

  /* ------------------------- FAZA 1: watch presence (live_state) ------------------------- */
  // Signal "sat se javio" = PROMENA stringa watch_last_hr_at (samo satov HR keep-alive ga
  // menja). Svezinu merimo telefonskim Date.now() od te promene - bez parsiranja serverskog
  // vremena (WKWebView/clock skew bi davao lazni lock). Kad sat ode offline, string vise ne
  // menja -> watchSignalLocalRef stari -> posle FRESH praga lock.
  useEffect(() => {
    if (!sessionId || finished) return;
    let cancelled = false;
    const apply = (row: any) => {
      if (cancelled) return;
      const raw = row?.watch_last_hr_at ?? null;
      if (raw && raw !== lastSeenWatchTsRef.current) {
        lastSeenWatchTsRef.current = raw;
        watchSignalLocalRef.current = Date.now();   // telefonski sat = pouzdana svezina
        setWatchEverPresent(true);                   // reaktivno: lock/baner racunaju "sat prisutan"
      }
      // Zivi HR sa sata stize INSTANT preko realtime-a (ne ceka 2s poll). Guard >0 da
      // nula/null ne pregazi prikaz.
      const chr = row?.current_hr;
      if (typeof chr === "number" && chr > 0) setWatchHr(chr);

      // POZICIJA iz realtime-a (instant; poll na 2s ostaje rezerva/korektor). Ista
      // logika kao applyPoll preko deljene applyPosition.
      // - finishedRef: posle kraja ne diramo poziciju.
      // - bez baseline pozicije (prvi poll jos nije stigao) ne diramo - poll je uspostavlja
      //   (i nosi startedAtMs/server_now_ms kojih realtime red NEMA).
      // - staleness: ako je korisnik upravo uradio optimisticku akciju, optimisticki
      //   prikaz ima prednost RT_POS_GUARD_MS; poll posle isteka uskladi.
      // - startedAtMs se SACUVA iz postojece pozicije (realtime nema started_at).
      // - rest_ends_at je timestamptz string -> pgTsToMs (server ms) - clockOffset (poll ga odrzava).
      if (finishedRef.current) return;
      const prevPos = posRef.current;
      if (!prevPos) return;
      if (Date.now() - lastActionAtRef.current < RT_POS_GUARD_MS) return;
      const restServerMs = pgTsToMs(row?.rest_ends_at);
      const restEndsAtMs = restServerMs != null ? restServerMs - clockOffsetRef.current : null;
      applyPosition({
        exerciseIdx: row?.current_exercise_idx,
        setNumber: row?.current_set_number,
        totalSets: row?.total_sets,
        state: row?.current_state,
        restEndsAtMs,
        startedAtMs: prevPos.startedAtMs,
        currentHr: typeof row?.current_hr === "number" ? row.current_hr : null,
      });
    };
    // Pocetni read: zapamti SAMO poslednju vidjenu vrednost (NE postavljaj signal, da prvi
    // PRAVI realtime postavi svezinu - inace bi sat koji je otisao pre otvaranja delovao svez).
    (async () => {
      const { data } = await supabase
        .from("workout_live_state")
        .select("watch_last_hr_at")
        .eq("session_log_id", sessionId)
        .maybeSingle();
      if (!cancelled) lastSeenWatchTsRef.current = (data as any)?.watch_last_hr_at ?? null;
    })();
    const channel = supabase
      .channel(`live-state:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workout_live_state", filter: `session_log_id=eq.${sessionId}` },
        (payload) => apply(payload.new),
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [sessionId, finished, realtimeEpoch, applyPosition]);

  // Sinhroni lockedRef (za handler guard) - racuna se na `now` tik (1s) I na promenu mreze.
  // Lock kad: (a) sat nestao (tisina > FRESH) ILI (b) telefon offline a sat prisutan (sat vozi
  // trening sa buffer-om). SOLO (watchEverPresent == false) -> mreza NIKAD ne zakljucava.
  useEffect(() => {
    const sig = watchSignalLocalRef.current;
    const stale = sig != null && Date.now() - sig > WATCH_FRESH_MS;
    const offlineWithWatch = !isOnline && watchEverPresent;
    controlsLockedRef.current = (stale || offlineWithWatch) && !phoneTakeover;
  }, [now, phoneTakeover, isOnline, watchEverPresent]);

  /* ------------------------- Heartbeat: athlete_heartbeat (samo HR + svežina) ------------------------- */
  // Dira SAMO last_heartbeat i current_hr — nikad poziciju. Drži živi red svežim
  // (poll filtrira last_heartbeat > now - 5min).
  useEffect(() => {
    if (!sessionId || finished) return;
    let stopped = false;
    const beat = async () => {
      if (stopped || finishedRef.current) return;
      try {
        await supabase.rpc("athlete_heartbeat", {
          p_session_id: sessionId,
          p_hr: liveHr ?? null,
        } as any);
      } catch {
        /* noop */
      }
    };
    beat();
    const id = setInterval(beat, 12000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [sessionId, liveHr, finished]);

  /* ------------------------- Live Activity (iOS lock screen) ------------------------- */
  // START kad postoji aktivna sesija + pozicija (jednom), UPDATE na promenu
  // pozicije/zone, uz throttle za sam puls. END ide kroz `finished` (finish/cancel/
  // poll-disappeared sve setuju finished) i kroz unmount (napustanje ekrana).
  // Citamo SAMO state - ne diramo poll, RPC-ove, optimisticki prelaz.
  useEffect(() => {
    if (!liveActivitySupported) return;
    if (finished || finishedRef.current) return;
    if (!sessionId || !pos || !day) return;
    if (pos.state === "completed") return;
    const ex = day.exercises[pos.exerciseIdx];
    if (!ex) return;

    const isResting = pos.state === "rest";
    // Isti izvor HR kao prikaz: sat (watchHr) instant kad je prisutan, poll fallback;
    // SOLO -> telefonov HealthKit (liveHr).
    const hrRaw = watchEverPresent
      ? (watchHr ?? pos.currentHr ?? liveHr)
      : (liveHr ?? pos.currentHr);
    const hr = typeof hrRaw === "number" && hrRaw > 0 ? hrRaw : null;

    const fields: LiveActivityFields = {
      exerciseName: ex.exercise.name,
      setNumber: pos.setNumber,
      totalSets: ex.sets ?? pos.totalSets,
      heartRate: hr ?? undefined,
      hrZone: getHrZone(hr),
      isResting,
      restEndsAtMs: isResting && pos.restEndsAtMs ? pos.restEndsAtMs : undefined,
      isDurationBased: !!ex.exercise.is_duration_based,
      durationMinutes: ex.exercise.is_duration_based ? (ex.duration_minutes ?? undefined) : undefined,
      watchConnected: watchEverPresent,
      thumbnailUrl: ex.exercise.thumbnail_url ?? undefined,
    };

    // Strukturni kljuc = sve sem same brojke pulsa (zona/watchConnected/slika unutra) -> promena salje odmah.
    const structKey = [
      fields.exerciseName, fields.setNumber, fields.totalSets, fields.isResting,
      fields.restEndsAtMs ?? "", fields.isDurationBased, fields.durationMinutes ?? "",
      fields.hrZone, fields.watchConnected, fields.thumbnailUrl ?? "",
    ].join("|");
    const nowMs = Date.now();

    if (!liveActivityStartedRef.current) {
      liveActivityStartedRef.current = true;
      laLastKeyRef.current = structKey;
      laLastHrRef.current = hr;
      laLastSentAtRef.current = nowMs;
      laStart({ athleteName: "", workoutStartedAtMs: pos.startedAtMs ?? Date.now(), ...fields });
      return;
    }

    const structChanged = structKey !== laLastKeyRef.current;
    const hrDelta = Math.abs((hr ?? 0) - (laLastHrRef.current ?? 0));
    const stale = nowMs - laLastSentAtRef.current > 5000;
    if (structChanged || hrDelta > 3 || stale) {
      laLastKeyRef.current = structKey;
      laLastHrRef.current = hr;
      laLastSentAtRef.current = nowMs;
      laUpdate(fields);
    }
  }, [sessionId, pos, day, watchHr, liveHr, watchEverPresent, finished]);

  // END: kraj treninga (finish / cancel / poll-disappeared -> svi setuju `finished`).
  useEffect(() => {
    if (finished && liveActivityStartedRef.current) {
      liveActivityStartedRef.current = false;
      laEnd();
    }
  }, [finished]);

  // END i na napustanje ekrana (unmount), za svaki slucaj (idempotentno).
  useEffect(() => {
    return () => { laEnd(); };
  }, []);

  // RPC greske: kad je telefon offline (ocekivano), tiho progutaj sirovu
  // "TypeError: Load failed"/"Failed to fetch" (ruzna i beskorisna korisniku); kad je
  // online, prikazi pravu poruku. Telefon+sat slucaj ionako ne stigne dovde (lock guard).
  const notifyRpcError = useCallback((error: { message?: string } | null | undefined) => {
    if (!error) return;
    const msg = error.message ?? "";
    const looksOffline =
      !isOnlineRef.current ||
      /load failed|failed to fetch|networkerror|network connection was lost/i.test(msg);
    if (looksOffline) {
      return;
    }
    toast.error(msg || "Greška. Pokušaj ponovo.");
  }, []);

  /* ------------------------- Helper: produži odmor (+30 kroz motor) ------------------------- */
  const handleAddRest = useCallback(
    async (extraSeconds: number) => {
      const p = posRef.current;
      if (!sessionId || !p || !p.restEndsAtMs) return;
      if (controlsLockedRef.current) return; // sat izgubljen -> ne menjaj odmor

      // Optimistički bump prikaza; poll uskladi sa serverskim rest_ends_at.
      const newClientEnd = p.restEndsAtMs + extraSeconds * 1000;
      lastActionAtRef.current = Date.now();
      setPos((prev) => (prev ? { ...prev, restEndsAtMs: newClientEnd } : prev));

      // +30 ide u motor (athlete_extend_rest doda sekunde samo ako je state rest),
      // isti izvor istine kao sat. Nema više direktnog upisa rest_ends_at.
      const { error } = await supabase.rpc("athlete_extend_rest", {
        p_session_id: sessionId,
        p_seconds: extraSeconds,
      } as any);
      lastActionAtRef.current = Date.now();
      if (error) notifyRpcError(error);
    },
    [sessionId, notifyRpcError]
  );

  /* ------------------------- Handlers (dugmad -> engine RPC, optimistički prikaz) ------------------------- */
  const handleSetComplete = useCallback(
    async (data: { reps: number; weight_kg: number; rpe: number | null; notes: string | null }) => {
      const p = posRef.current;
      if (!sessionId || !p || !day) return;
      if (controlsLockedRef.current) return; // sat izgubljen -> bez mutacije sesije
      triggerHaptic();

      const ex = day.exercises[p.exerciseIdx];
      const isLastSet = p.setNumber >= (ex?.sets ?? p.totalSets);
      const isLastExercise = p.exerciseIdx >= day.exercises.length - 1;
      const isWorkoutDone = isLastSet && isLastExercise;

      // Optimistički log za labele (best-effort)
      setCompletedSets((prev) => [
        ...prev.filter(
          (c) => !(c.exerciseIndex === p.exerciseIdx && c.setNumber === p.setNumber)
        ),
        {
          exerciseIndex: p.exerciseIdx,
          setNumber: p.setNumber,
          reps: data.reps,
          weight_kg: data.weight_kg,
        },
      ]);

      lastActionAtRef.current = Date.now();

      if (isWorkoutDone) {
        // Zadnja serija: athlete_complete_set LOGUJE seriju I finalizuje sesiju.
        // markFinished ODMAH gasi poll i heartbeat, da posle kraja ništa ne ostane živo.
        setFinishing(true);
        markFinished();
        const { error } = await supabase.rpc("athlete_complete_set", {
          p_session_id: sessionId,
          p_reps: data.reps,
          p_weight: data.weight_kg,
          p_rpe: data.rpe,
        } as any);
        if (error) {
          notifyRpcError(error);
          finishedRef.current = false;
          setFinished(false);
          setFinishing(false);
          return;
        }
        await finalizeAndNav();
        setFinishing(false);
        return;
      }

      // Optimistički: uđi u odmor sa predviđenom sledećom pozicijom; poll koriguje.
      // Pauza BAS zavrsenog seta (p.setNumber) iz set_details; fallback na parent (targetForSet),
      // pa na 60s kad nema/0.
      const perSetRest = ex ? targetForSet(ex, p.setNumber).rest : null;
      const restSec = perSetRest && perSetRest > 0 ? perSetRest : 60;
      const nextIdx = isLastSet ? p.exerciseIdx + 1 : p.exerciseIdx;
      const nextSet = isLastSet ? 1 : p.setNumber + 1;
      const nextEx = day.exercises[nextIdx];
      // Kraj odmora računamo kao serverNow + trajanje (serverNow = Date.now + offset),
      // pa vratimo u KLIJENT epohu (kao i poll: serverRestMs - offset). Tako se
      // optimistički kraj poklopi sa serverskim i nema skoka kad poll stigne.
      const serverNowMs = Date.now() + clockOffsetRef.current;
      const serverRestEndMs = serverNowMs + restSec * 1000;
      setPos({
        exerciseIdx: nextIdx,
        setNumber: nextSet,
        totalSets: nextEx?.sets ?? p.totalSets,
        state: "rest",
        restEndsAtMs: serverRestEndMs - clockOffsetRef.current,
        startedAtMs: p.startedAtMs,
        currentHr: p.currentHr,
      });

      const { error } = await supabase.rpc("athlete_complete_set", {
        p_session_id: sessionId,
        p_reps: data.reps,
        p_weight: data.weight_kg,
        p_rpe: data.rpe,
      } as any);
      lastActionAtRef.current = Date.now();
      if (error) notifyRpcError(error);
    },
    [sessionId, day, finalizeAndNav, markFinished, notifyRpcError]
  );

  // Kardio "Zavrsi vezbu": kardio = TACNO 1 set, pa zavrsetak vezbe = zavrsetak njenog
  // jedinog seta -> isti put kao zadnji set u snazi (athlete_complete_set), samo nosi
  // p_duration_minutes umesto reps/weight/rpe. Posle: prelaz na sledecu / rest / kraj.
  const handleCardioComplete = useCallback(
    async (minutes: number) => {
      const p = posRef.current;
      if (!sessionId || !p || !day) return;
      if (controlsLockedRef.current) return;   // sat izgubljen -> bez mutacije sesije
      if (cardioBusy) return;                   // anti dvostruki tap
      setCardioBusy(true);
      triggerHaptic();

      const ex = day.exercises[p.exerciseIdx];
      const isLastExercise = p.exerciseIdx >= day.exercises.length - 1;
      const isWorkoutDone = isLastExercise;   // kardio (1 set) -> zavrsetak vezbe je i kraj ako je poslednja

      lastActionAtRef.current = Date.now();

      if (isWorkoutDone) {
        setFinishing(true);
        markFinished();
        const { error } = await supabase.rpc("athlete_complete_set", {
          p_session_id: sessionId,
          p_duration_minutes: minutes,
        } as any);
        if (error) {
          notifyRpcError(error);
          finishedRef.current = false;
          setFinished(false);
          setFinishing(false);
          setCardioBusy(false);
          return;
        }
        await finalizeAndNav();
        setFinishing(false);
        return;
      }

      // Optimisticki: predji u odmor sa sledecom vezbom (kardio je uvek "poslednji set" svoje vezbe).
      const restSec = ex?.rest_seconds && ex.rest_seconds > 0 ? ex.rest_seconds : 60;
      const nextIdx = p.exerciseIdx + 1;
      const nextEx = day.exercises[nextIdx];
      const serverNowMs = Date.now() + clockOffsetRef.current;
      const serverRestEndMs = serverNowMs + restSec * 1000;
      setPos({
        exerciseIdx: nextIdx,
        setNumber: 1,
        totalSets: nextEx?.sets ?? p.totalSets,
        state: "rest",
        restEndsAtMs: serverRestEndMs - clockOffsetRef.current,
        startedAtMs: p.startedAtMs,
        currentHr: p.currentHr,
      });

      const { error } = await supabase.rpc("athlete_complete_set", {
        p_session_id: sessionId,
        p_duration_minutes: minutes,
      } as any);
      lastActionAtRef.current = Date.now();
      if (error) notifyRpcError(error);
      setCardioBusy(false);
    },
    [sessionId, day, cardioBusy, finalizeAndNav, markFinished, notifyRpcError]
  );

  const skipRest = useCallback(async () => {
    const p = posRef.current;
    if (!sessionId || !p) return;
    if (controlsLockedRef.current) return; // sat izgubljen -> ne preskaci/ne advance-uj
    lastActionAtRef.current = Date.now();
    setPos((prev) => (prev ? { ...prev, state: "active", restEndsAtMs: null } : prev));
    const { error } = await supabase.rpc("athlete_skip_rest", {
      p_session_id: sessionId,
    } as any);
    lastActionAtRef.current = Date.now();
    if (error) notifyRpcError(error);
  }, [sessionId, notifyRpcError]);

  const finishWorkout = useCallback(async () => {
    if (!sessionId || finishing || finishedRef.current) return;
    if (controlsLockedRef.current) return; // sat izgubljen -> ne zavrsavaj sa telefona
    setFinishing(true);
    markFinished();
    lastActionAtRef.current = Date.now();
    const { error } = await supabase.rpc("athlete_finish_workout", {
      p_session_id: sessionId,
    } as any);
    if (error) {
      notifyRpcError(error);
      finishedRef.current = false;
      setFinished(false);
      setFinishing(false);
      return;
    }
    await finalizeAndNav();
    setFinishing(false);
  }, [sessionId, finishing, finalizeAndNav, markFinished, notifyRpcError]);

  const confirmCancel = async () => {
    markFinished();
    if (sessionId) {
      await supabase.rpc("cancel_workout_session", { p_session_id: sessionId } as any);
      await supabase.from("workout_live_state" as any).delete().eq("session_log_id", sessionId);
    }
    setCloseOpen(false);
    nav("/vezbac");
  };

  /* ------------------------- Render ------------------------- */
  // 0) PRELAZ NA REZIME: cim smo odlucili da zavrsimo (rucno / poslednja serija /
  // sat zavrsio), brendiran ekran umesto belog spinnera ili zaledjenog treninga.
  if (finishingToSummary) {
    if (finishError) {
      return (
        <div className="h-[100dvh] bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="h-14 w-14 rounded-2xl bg-surface-2 flex items-center justify-center">
            <Dumbbell className="h-6 w-6 text-muted-foreground" strokeWidth={2} />
          </div>
          <p className="text-[15px] font-semibold text-foreground">Ne mogu da otvorim rezime</p>
          <div className="flex flex-col gap-2 w-full max-w-[260px]">
            <button
              onClick={() => {
                setFinishError(false);
                const sid = sessionIdRef.current;
                if (sid) nav(`/vezbac/trening/zavrsen/${sid}`, { replace: true });
                else nav("/vezbac/trening", { replace: true });
              }}
              className="h-11 rounded-2xl bg-gradient-brand text-white font-semibold shadow-brand active:scale-95 transition"
            >
              Pokušaj ponovo
            </button>
            <button
              onClick={() => nav("/vezbac/trening")}
              className="h-11 rounded-2xl bg-surface border border-hairline text-foreground font-semibold active:scale-95 transition"
            >
              Nazad
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="h-[100dvh] bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="h-16 w-16 rounded-2xl bg-gradient-brand flex items-center justify-center shadow-brand animate-pulse">
          <Dumbbell className="h-7 w-7 text-white" strokeWidth={2.5} />
        </div>
        <div className="text-[15px] font-semibold text-foreground">Završavam trening...</div>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // 1) LOADING: spinner samo dok ucitavamo dan / pokrecemo sesiju.
  if (loading) {
    return (
      <div className="h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // 2) GRESKA ili DAN BEZ VEZBI (0 aktivnih): uredan prazan state, nikako spinner.
  if (loadError || !day || day.exercises.length === 0) {
    const emptyMsg =
      loadError ??
      (day && day.exercises.length === 0 ? "Ovaj dan nema vežbe" : "Trening nije dostupan");
    return (
      <div className="h-[100dvh] bg-background flex items-center justify-center px-6 text-center">
        <div className="space-y-4 max-w-[300px]">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-surface-2 flex items-center justify-center">
            <Dumbbell className="h-6 w-6 text-muted-foreground" strokeWidth={2} />
          </div>
          <p className="text-[15px] font-semibold text-foreground">{emptyMsg}</p>
          <button
            onClick={() => nav("/vezbac/trening")}
            className="inline-flex items-center justify-center h-11 px-6 rounded-2xl bg-gradient-brand text-white font-semibold shadow-brand active:scale-95 transition"
          >
            Nazad
          </button>
        </div>
      </div>
    );
  }

  // 3) Dan ima vezbe; cekamo sesiju / prvi poll sa serverskom pozicijom (kratko).
  if (!pos || !current) {
    return (
      <div className="h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const exerciseIdx = pos.exerciseIdx;
  const setNumber = pos.setNumber;
  const setsForCurrent = current.sets;
  const setsList = Array.from({ length: setsForCurrent }, (_, i) => i + 1);
  // Cilj TRENUTNOG seta (per-set iz set_details, fallback na parent) - za prikaz i prefil.
  const curTarget = targetForSet(current, setNumber);
  const progressPct = totalSetsAll > 0 ? (completedTotal / totalSetsAll) * 100 : 0;
  // Sat prisutan: realtime current_hr sa sata (watchHr) je najsvezi (instant), poll
  // (pos.currentHr) fallback. SOLO: telefonov HealthKit (liveHr) direktno, kao do sad.
  const hr = watchEverPresent
    ? (watchHr ?? pos.currentHr ?? liveHr)
    : (liveHr ?? pos.currentHr);
  const isResting = pos.state === "rest" && pos.restEndsAtMs != null;
  const restSubtitle =
    setNumber <= 1
      ? `Sledeća vežba: ${current.exercise.name_en?.trim() || current.exercise.name}`
      : `Sledeća serija ${setNumber} od ${setsForCurrent}`;

  // FAZA 1 - watch presence (SOLO: signal nikad postavljen -> sve false, nikad lock).
  // Svezina = telefonski Date.now() od poslednje PROMENE watch_last_hr_at (re-render ide
  // preko `now` 1s tika). Bez parsiranja serverskog vremena.
  const watchWasPresent = watchEverPresent;
  const watchSilenceMs = watchWasPresent ? Date.now() - (watchSignalLocalRef.current as number) : 0;
  const watchStale = watchWasPresent && watchSilenceMs > WATCH_FRESH_MS;
  const phoneOffline = !isOnline;
  // INSTANT lock: telefon padne sa mreze A sat je prisutan -> sat vozi trening (ima offline
  // buffer), telefon ne sme da menja sesiju. Ne ceka 15s watch-stale rupu.
  const offlineWithWatch = phoneOffline && watchWasPresent;
  // Pravi gubitak sata: tisina > 15s DOK je telefon ONLINE. (Offline tisinu pokriva
  // offlineWithWatch i prikazuje tacnu poruku - telefon je taj bez veze, ne sat.)
  const isWatchLost = watchStale && !phoneOffline && !phoneTakeover;
  // Escape "Nastavi na telefonu" SAMO za pravi gubitak sata (NE za cist offline - bez mreze
  // telefon ionako ne moze da vozi trening).
  const canEscapeWatch = isWatchLost && watchSilenceMs > WATCH_ESCAPE_MS;
  const showMildTakeover = watchStale && phoneTakeover;
  // Baner "Telefon nije na vezi. Trening ide preko sata." (lock, bez escape).
  const showOfflineWithWatch = offlineWithWatch && !phoneTakeover;
  // SOLO (watchWasPresent == false): mreza NIKAD ne zakljucava (telefon radi/ne radi sam).
  const controlsLocked = !phoneTakeover && (isWatchLost || offlineWithWatch);

  return (
    <div className="h-[100dvh] overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-[440px] min-h-screen relative pb-10">
        {/* Top bar */}
        <div
          className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-hairline"
          style={{ paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 8px)" }}
        >
          <div className="px-4 pb-3 flex items-center gap-3">
            <button
              onClick={() => setCloseOpen(true)}
              aria-label="Zatvori"
              className="h-10 w-10 rounded-full bg-surface border border-hairline flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Aktivan trening{pos.startedAtMs ? ` · ${fmtElapsed(elapsedMs)}` : ""}
              </div>
              <div className="text-[13px] font-bold text-foreground truncate">
                Vežba {exerciseIdx + 1} od {exercises.length}
                {current.exercise.is_duration_based ? "" : ` · Serija ${setNumber} od ${setsForCurrent}`}
              </div>
            </div>
            <div
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-surface border border-hairline shrink-0"
              style={{ color: hr && hr > 0 ? getHrColor(hr) : undefined }}
              aria-label="Trenutni puls"
            >
              <Heart
                className={cn("h-3.5 w-3.5", hr && hr > 0 && "animate-pulse")}
                strokeWidth={2.4}
                fill={hr && hr > 0 ? "currentColor" : "none"}
              />
              <span className="text-[13px] font-bold tnum leading-none">
                {hr && hr > 0 ? hr : "-"}
              </span>
            </div>
          </div>
          <div className="h-1 bg-surface-2">
            <div
              className="h-full bg-gradient-brand transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* SOLO offline (bez sata): trening se ne cuva dok se veza ne vrati. Telefon+sat
            slucaj ima svoj baner (showOfflineWithWatch) - tamo trening ide preko sata. */}
        {phoneOffline && !showOfflineWithWatch && (
          <div className="px-4 pt-3">
            <div
              className="rounded-2xl border border-warning/40 bg-warning-soft text-warning-soft-foreground px-4 py-3 flex items-start gap-3"
              role="status"
              aria-live="polite"
            >
              <WifiOff className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2.4} />
              <div className="text-[13px] font-semibold leading-snug">
                Nema interneta. Trening se ne čuva dok se veza ne vrati.
              </div>
            </div>
          </div>
        )}

        {incomingMessage && (
          <div className="px-4 pt-3">
            <div
              className={cn(
                "rounded-2xl border px-4 py-3 flex items-start gap-3 shadow-xs animate-fade-in",
                incomingMessage.message_type === "warning" &&
                  "bg-destructive-soft border-destructive/30 text-destructive-soft-foreground",
                incomingMessage.message_type === "encouragement" &&
                  "bg-success-soft border-success/30 text-success-soft-foreground",
                incomingMessage.message_type !== "warning" &&
                  incomingMessage.message_type !== "encouragement" &&
                  "bg-primary-soft border-primary/30 text-primary-soft-foreground",
              )}
              role="status"
              aria-live="polite"
            >
              <div className="h-9 w-9 rounded-full bg-gradient-brand text-white inline-flex items-center justify-center shrink-0">
                <MessageCircle className="h-4 w-4" strokeWidth={2.4} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-80">
                  Trener:
                </div>
                <div className="text-[14px] font-semibold leading-snug mt-0.5">
                  {incomingMessage.message}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIncomingMessage(null)}
                aria-label="Zatvori"
                className="h-7 w-7 rounded-full inline-flex items-center justify-center hover:bg-black/5 transition active:scale-95"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <div className="px-4 pt-4 space-y-5">
          <ExerciseHeader
            name={current.exercise.name}
            nameEn={current.exercise.name_en}
            primaryMuscle={current.exercise.primary_muscle}
            thumbnailUrl={current.exercise.thumbnail_url}
            videoUrl={current.exercise.video_url}
            instructions={current.exercise.instructions}
          />

          {current.exercise.is_duration_based ? (
            /* KARDIO (na minute): cilj iz plana + veliki stepper Minuti + "Zavrsi vezbu".
               Bez serija/reps/kg/RPE i bez liste serija. Zavrsetak ide kroz isti
               athlete_complete_set, samo sa p_duration_minutes (kardio = 1 set). */
            <div className="space-y-3">
              {/* Cilj trajanja iz plana (prikaz iznad steppera) */}
              <div className="rounded-2xl bg-surface border border-hairline p-3 text-center">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Cilj
                </div>
                <div className="font-display text-[22px] font-bold tracking-tightest tnum mt-0.5">
                  {current.duration_minutes != null ? `${current.duration_minutes} min` : "-"}
                </div>
              </div>

              {/* Stepper: Minuti (korak 1, opseg 1-240) */}
              <div className="rounded-3xl bg-surface border border-hairline p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground text-center mb-3">
                  Minuti
                </div>
                <div className="flex items-center justify-center gap-5">
                  <button
                    type="button"
                    onClick={() => setCardioMinutes((m) => Math.max(1, m - 1))}
                    disabled={controlsLocked || cardioMinutes <= 1}
                    aria-label="Manje"
                    className="h-12 w-12 rounded-2xl bg-surface-2 border border-hairline flex items-center justify-center text-foreground disabled:opacity-40 active:scale-95 transition"
                  >
                    <Minus className="h-5 w-5" strokeWidth={2.6} />
                  </button>
                  <div className="font-display text-[44px] font-bold tracking-tightest tnum w-24 text-center">
                    {cardioMinutes}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCardioMinutes((m) => Math.min(240, m + 1))}
                    disabled={controlsLocked || cardioMinutes >= 240}
                    aria-label="Više"
                    className="h-12 w-12 rounded-2xl bg-surface-2 border border-hairline flex items-center justify-center text-foreground disabled:opacity-40 active:scale-95 transition"
                  >
                    <Plus className="h-5 w-5" strokeWidth={2.6} />
                  </button>
                </div>
              </div>

              {/* Zavrsi vezbu -> athlete_complete_set sa p_duration_minutes; pa prelaz/rest/kraj */}
              <button
                type="button"
                onClick={() => handleCardioComplete(cardioMinutes)}
                disabled={cardioBusy || finishing || controlsLocked}
                className="w-full h-14 rounded-2xl bg-gradient-brand text-white font-bold text-[15px] shadow-brand active:scale-95 transition disabled:opacity-50"
              >
                {cardioBusy || finishing ? "Završavam..." : "Završi vežbu"}
              </button>
            </div>
          ) : (
            <>
              {/* Target stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-surface border border-hairline p-3 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Serije
                  </div>
                  <div className="font-display text-[22px] font-bold tracking-tightest tnum mt-0.5">
                    {Math.min(setNumber, setsForCurrent)}
                    <span className="text-muted-foreground">/{setsForCurrent}</span>
                  </div>
                </div>
                <div className="rounded-2xl bg-surface border border-hairline p-3 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Cilj reps
                  </div>
                  <div className="font-display text-[22px] font-bold tracking-tightest tnum mt-0.5">
                    {curTarget.repsText ?? "-"}
                  </div>
                </div>
                <div className="rounded-2xl bg-surface border border-hairline p-3 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Cilj kg
                  </div>
                  <div className="font-display text-[22px] font-bold tracking-tightest tnum mt-0.5">
                    {curTarget.weight ?? "-"}
                  </div>
                </div>
              </div>

              {/* Sets list */}
              <div className="rounded-3xl bg-surface border border-hairline overflow-hidden">
                {setsList.map((n) => {
                  // Markeri "urađeno" se izvode iz pozicije (server), ne iz lokalnog loga.
                  const done = n < setNumber;
                  const active = n === setNumber && pos.state === "active";
                  const completed = completedSets.find(
                    (c) => c.exerciseIndex === exerciseIdx && c.setNumber === n
                  );
                  const t = targetForSet(current, n);   // cilj BAS ovog seta
                  return (
                    <div
                      key={n}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 border-b border-hairline last:border-b-0",
                        active && "bg-primary-soft/30"
                      )}
                    >
                      <div
                        className={cn(
                          "h-7 w-7 rounded-full flex items-center justify-center text-[12px] font-bold tnum",
                          done
                            ? "bg-success text-white"
                            : active
                              ? "bg-gradient-brand text-white"
                              : "bg-surface-2 text-muted-foreground"
                        )}
                      >
                        {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
                      </div>
                      <div className="flex-1 text-[13px]">
                        <span className="font-semibold text-foreground">Serija {n}</span>
                        {completed ? (
                          <span className="text-muted-foreground">
                            {" · "}
                            {completed.reps} reps · {completed.weight_kg} kg
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {" · cilj "}
                            {t.repsText ?? "-"} × {t.weight ?? "-"} kg
                          </span>
                        )}
                      </div>
                      {active && <ChevronRight className="h-4 w-4 text-primary" />}
                    </div>
                  );
                })}
              </div>

              {/* Active set logger */}
              <SetLogger
                key={`${exerciseIdx}-${setNumber}`}
                setNumber={setNumber}
                totalSets={setsForCurrent}
                targetReps={curTarget.reps}
                targetWeightKg={curTarget.weight}
                initialReps={initialFor(exerciseIdx, setNumber)?.reps ?? null}
                initialWeightKg={initialFor(exerciseIdx, setNumber)?.weight_kg ?? null}
                onComplete={handleSetComplete}
                disabled={controlsLocked}
              />
            </>
          )}

          {/* Manual finish */}
          <button
            type="button"
            onClick={() => finishWorkout()}
            disabled={finishing || controlsLocked}
            className="w-full text-[12px] font-semibold text-muted-foreground py-3 disabled:opacity-50"
          >
            {finishing ? "Završavam..." : "Završi trening odmah"}
          </button>
        </div>
      </div>

      {isResting && pos.restEndsAtMs != null && (
        <RestTimer
          endsAt={pos.restEndsAtMs}
          subtitle={restSubtitle}
          onDone={skipRest}
          onAddSeconds={handleAddRest}
          disabled={controlsLocked}
        />
      )}

      {/* Telefon offline a sat prisutan: sat vozi trening (offline buffer), telefon je
          zakljucan. Tacna poruka (telefon je bez veze, ne sat). Bez escape - bez mreze
          telefon ionako ne moze da vozi. Iznad svega (z-60), kao i watch-lost baner. */}
      {showOfflineWithWatch && (
        <div
          className="fixed top-0 left-0 right-0 z-[60] px-4"
          style={{ paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 8px)" }}
        >
          <div className="mx-auto w-full max-w-[440px]">
            <div
              className="rounded-2xl border border-warning/40 bg-warning-soft text-warning-soft-foreground px-4 py-3 shadow-xs"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-start gap-3">
                <WifiOff className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2.4} />
                <div className="text-[13px] font-semibold leading-snug">
                  Telefon nije na vezi. Trening ide preko sata.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FAZA 1: izgubljen sat -> zakljucano. Baner iznad svega (z-60), i preko RestTimer-a (z-50). */}
      {isWatchLost && (
        <div
          className="fixed top-0 left-0 right-0 z-[60] px-4"
          style={{ paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 8px)" }}
        >
          <div className="mx-auto w-full max-w-[440px]">
            <div
              className="rounded-2xl border border-destructive/40 bg-destructive-soft text-destructive-soft-foreground px-4 py-3 shadow-xs"
              role="alert"
              aria-live="assertive"
            >
              <div className="flex items-start gap-3">
                <WifiOff className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2.4} />
                <div className="text-[13px] font-semibold leading-snug">
                  IZGUBLJEN SIGNAL SA SATOM. Nastavi na satu ili ga približi telefonu.
                </div>
              </div>
              {canEscapeWatch && (
                <button
                  type="button"
                  onClick={() => setPhoneTakeover(true)}
                  className="mt-2.5 w-full h-10 rounded-xl bg-surface text-foreground text-[13px] font-semibold active:scale-95 transition"
                >
                  Nastavi na telefonu
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showMildTakeover && (
        <div
          className="fixed top-0 left-0 right-0 z-[60] px-4"
          style={{ paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 8px)" }}
        >
          <div className="mx-auto w-full max-w-[440px]">
            <div className="rounded-2xl border border-hairline bg-surface/90 backdrop-blur text-muted-foreground px-4 py-2 text-[12px] font-medium text-center">
              Nastavljaš na telefonu
            </div>
          </div>
        </div>
      )}

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

export default ActiveWorkout;
