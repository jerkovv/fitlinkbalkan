import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Check, MessageSquare, Clock, Dumbbell, Flame, Heart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  FullScreenSheet,
  FullScreenSheetScroll,
  FullScreenSheetFooter,
} from "@/components/ui/full-screen-sheet";
import { Textarea } from "@/components/ui/textarea";
import { HRZonesChart } from "@/components/wearables/HRZonesChart";
import type { ZoneBucket } from "@/lib/wearable/hrZones";

type SessionRow = {
  id: string;
  athlete_id: string;
  assigned_program_id: string | null;
  day_id: string | null;
  day_number: number | null;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
  total_volume_kg: number | null;
  active_calories: number | null;
  live_hr_avg: number | null;
  live_hr_max: number | null;
};

type SetRow = {
  id: string;
  exercise_id: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  done: boolean;
};

type ExRow = {
  id: string;
  position: number;
  sets: number;
  duration_minutes: number | null;
  exercises: { name: string; primary_muscle: string | null; is_duration_based: boolean | null } | null;
};

const fmtDuration = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
};

// Mrezni poziv na tek-probudenoj vezi zna da visi 15-30s. withTimeout odbaci posle ms.
function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

// Kratak timeout + par brzih retrija (umesto jednog visceg zahteva 15-30s).
async function fetchWithRetry<T>(
  fn: () => PromiseLike<T>,
  attempts = 2,
  timeoutMs = 3500,
  gapMs = 1500
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, gapMs));
    }
  }
  throw lastErr;
}

const WorkoutSummary = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const nav = useNavigate();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [exercises, setExercises] = useState<ExRow[]>([]);
  const [showCheck, setShowCheck] = useState(false);
  // HR zone iz get_inapp_workout_detail (isti izvor kao InApp dialog). Racunaju se iz
  // hr_series koji sat upise par sekundi POSLE finish-a, pa se refetch-uju uz metrike.
  const [zones, setZones] = useState<ZoneBucket[]>([]);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const SESSION_COLS =
    "id, athlete_id, assigned_program_id, day_id, day_number, started_at, completed_at, notes, total_volume_kg, active_calories, live_hr_avg, live_hr_max";

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const sid = sessionId;
      // Nevalidan sessionId -> odmah error, ne vrti.
      if (!sid || sid === "undefined" || sid === "null") {
        if (!cancelled) setLoadError("Trening nije pronađen");
        return;
      }

      // 1) SESSION (kriticno): STRIKTNO read-only - bez complete_workout_session (taj
      // viseci write je davao 15-30s). AUTO-RETRY do 3 puta sa ~2s razmaka PRE prikaza
      // rucnog "Pokusaj ponovo" - prvi pokusaj na tek-uspostavljenoj vezi zna da padne.
      // Tokom auto-retry-a OSTAJE brendiran "Zavrsavam trening..." (ne postavljamo loadError
      // dok svi pokusaji ne padnu - session i loadError ostaju null -> branded ekran).
      let sess: any = null;
      let sessErr: any = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const sessRes: any = await withTimeout(
            supabase.from("workout_session_logs").select(SESSION_COLS).eq("id", sid).maybeSingle(),
            3000
          );
          if (sessRes.error) throw sessRes.error;
          sess = sessRes.data;
          sessErr = null;
          break;
        } catch (e: any) {
          sessErr = e;
          if (cancelled) return;
          if (attempt < 3) await new Promise((r) => setTimeout(r, 2000));
        }
      }
      if (cancelled) return;
      if (sessErr) {
        setLoadError("Ne mogu da otvorim rezime");
        return;
      }
      if (!sess) {
        if (!cancelled) setLoadError("Trening nije pronađen");
        return;
      }
      if (cancelled) return;

      // Prikazi rezime ODMAH (trajanje/volumen iz session; puls/kcal su vec u redu).
      const sessionRow = sess as SessionRow;
      setSession(sessionRow);
      setNoteText(sessionRow.notes ?? "");

      // 2) SETS (best-effort): ne obara ekran ako padne; serije/volumen se dopune.
      try {
        const setRes: any = await fetchWithRetry(() =>
          supabase
            .from("set_logs")
            .select("id, exercise_id, set_number, reps, weight_kg, done")
            .eq("session_log_id", sid),
          2
        );
        if (!cancelled) setSets(((setRes.data as any[]) ?? []) as SetRow[]);
      } catch (e: any) {
      }

      // 3) EXERCISES (best-effort)
      if (sessionRow.day_id) {
        try {
          const exRes: any = await fetchWithRetry(() =>
            supabase
              .from("assigned_program_exercises")
              .select("id, position, sets, duration_minutes, exercises(name, primary_muscle, is_duration_based)")
              .eq("day_id", sessionRow.day_id)
              .order("position", { ascending: true }),
            2
          );
          if (!cancelled) setExercises(((exRes.data as any[]) ?? []) as ExRow[]);
        } catch (e: any) {
        }
      }

      setTimeout(() => setShowCheck(true), 60);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, user, reloadKey]);

  // Failsafe: ako se rezime ne ucita za ~7s (a nema vec greske), prekini brendiran
  // spinner i prikazi error+retry. Restartuje se na retry (reloadKey).
  useEffect(() => {
    if (session || loadError) return;
    // 15s: backstop IZNAD auto-retry prozora (3 pokusaja x 3s + 2 x 2s razmak ~= 13s). load()
    // sam postavi error cim svi auto-pokusaji padnu; ovo hvata samo neocekivano visenje.
    const t = setTimeout(() => {
      setLoadError("Ne mogu da otvorim rezime");
    }, 15000);
    return () => clearTimeout(t);
  }, [session, loadError, reloadKey]);

  // Sat upisuje metrike (kcal + HR) preko reportMetrics par sekundi POSLE otvaranja
  // ovog ekrana (auto-finish / rucni finish). Osvezi plocice kad stignu: realtime
  // UPDATE na red sesije (preferirano) + backstop refetch na 2s i 5s. Popunjavamo
  // samo prisutne vrednosti (?? prev) da kasna nula ne pregazi vec prikazanu.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const applyMetrics = (row: any) => {
      if (!row || cancelled) return;
      setSession((prev) =>
        prev
          ? {
              ...prev,
              active_calories: row.active_calories ?? prev.active_calories,
              live_hr_avg: row.live_hr_avg ?? prev.live_hr_avg,
              live_hr_max: row.live_hr_max ?? prev.live_hr_max,
            }
          : prev
      );
    };

    // Zone iz istog RPC-a kao InApp dialog (server ih racuna iz hr_series). Prazno dok sat
    // ne upise hr_series -> refetch uz metrike hvata ih kad stignu.
    const fetchZones = async () => {
      const { data, error } = await supabase.rpc("get_inapp_workout_detail" as any, {
        p_session_id: sessionId,
      });
      if (error || cancelled) return;
      const detail = (Array.isArray(data) ? data[0] : data) as any;
      if (detail?.zones) setZones(detail.zones as ZoneBucket[]);
    };

    const refetch = async () => {
      const { data } = await supabase
        .from("workout_session_logs")
        .select("active_calories, live_hr_avg, live_hr_max")
        .eq("id", sessionId)
        .maybeSingle();
      applyMetrics(data);
      fetchZones();
    };

    const channel = supabase
      .channel(`session-metrics:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "workout_session_logs", filter: `id=eq.${sessionId}` },
        (payload) => { applyMetrics(payload.new); fetchZones(); }
      )
      .subscribe();

    fetchZones();
    const t2 = setTimeout(refetch, 2000);
    const t5 = setTimeout(refetch, 5000);

    return () => {
      cancelled = true;
      clearTimeout(t2);
      clearTimeout(t5);
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const stats = useMemo(() => {
    if (!session) return null;
    const start = new Date(session.started_at).getTime();
    const end = session.completed_at ? new Date(session.completed_at).getTime() : Date.now();
    const completedSets = sets.filter((s) => s.done).length;
    const totalReps = sets.reduce((a, s) => a + (s.done ? Number(s.reps ?? 0) : 0), 0);
    const totalVolume =
      session.total_volume_kg != null
        ? Number(session.total_volume_kg)
        : sets.reduce(
            (a, s) =>
              a + (s.done ? Number(s.reps ?? 0) * Number(s.weight_kg ?? 0) : 0),
            0
          );
    return {
      durationMs: end - start,
      completedSets,
      totalReps,
      totalVolume,
      hrAvg: session.live_hr_avg,
      hrMax: session.live_hr_max,
      kcal: session.active_calories,
    };
  }, [session, sets]);

  const exerciseSummaries = useMemo(() => {
    return exercises.map((ex) => {
      const exSets = sets.filter((s) => s.exercise_id === ex.id);
      const done = exSets.filter((s) => s.done);
      const reps = done.reduce((a, s) => a + Number(s.reps ?? 0), 0);
      const maxW = done.reduce((a, s) => Math.max(a, Number(s.weight_kg ?? 0)), 0);
      return {
        id: ex.id,
        name: ex.exercises?.name ?? "Vežba",
        muscle: ex.exercises?.primary_muscle ?? null,
        isDuration: ex.exercises?.is_duration_based ?? false,
        durationMinutes: ex.duration_minutes ?? null,
        doneSets: done.length,
        totalSets: ex.sets,
        reps,
        maxWeight: maxW,
      };
    });
  }, [exercises, sets]);

  const saveNote = async () => {
    if (!sessionId) return;
    setSavingNote(true);
    const { error } = await supabase
      .from("workout_session_logs")
      .update({ notes: noteText.trim() || null } as any)
      .eq("id", sessionId);
    setSavingNote(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (session) setSession({ ...session, notes: noteText.trim() || null });
    setNoteOpen(false);
    toast.success("Komentar poslat treneru");
  };

  // Greska / timeout: NIKAD beskonacni spinner -> poruka + Pokusaj ponovo + Nazad.
  if (loadError) {
    return (
      <div className="h-[100dvh] bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="h-14 w-14 rounded-2xl bg-surface-2 flex items-center justify-center">
          <Dumbbell className="h-6 w-6 text-muted-foreground" strokeWidth={2} />
        </div>
        <p className="text-[15px] font-semibold text-foreground">{loadError}</p>
        <div className="flex flex-col gap-2 w-full max-w-[260px]">
          <button
            onClick={() => { setLoadError(null); setReloadKey((k) => k + 1); }}
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

  // Cim imamo red sesije, prikazi rezime ODMAH (trajanje/volumen/serije iz session+sets;
  // puls/kcal se dopune preko realtime/refetch). Dok session jos nema -> brendiran ekran
  // (ne beo spinner), isti kao "Zavrsavam trening..." iz ActiveWorkout prelaza.
  if (!session || !stats) {
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

  return (
    <div className="h-[100dvh] overflow-y-auto bg-background">
      <div
        className="mx-auto w-full max-w-[440px] min-h-screen px-4 pb-10"
        style={{ paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 24px)" }}
      >
        {/* Hero check */}
        <div className="text-center pt-6 pb-2">
          <div
            className={cn(
              "mx-auto h-20 w-20 rounded-full bg-success text-white flex items-center justify-center transition-all duration-500",
              showCheck ? "scale-100 opacity-100" : "scale-50 opacity-0"
            )}
            style={{ boxShadow: "0 12px 40px -10px hsl(var(--success) / 0.55)" }}
          >
            <Check className="h-10 w-10" strokeWidth={3.2} />
          </div>
          <h1 className="font-display text-[30px] font-bold tracking-tightest leading-tight mt-5">
            Trening završen
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1.5">
            Sjajan posao 💪 Tvoj napredak je sačuvan.
          </p>
        </div>

        {/* Stats grid 2x2 */}
        <div className="grid grid-cols-2 gap-3 mt-6">
          <StatTile
            icon={<Clock className="h-4 w-4" />}
            label="Trajanje"
            value={fmtDuration(stats.durationMs)}
          />
          <StatTile
            icon={<Dumbbell className="h-4 w-4" />}
            label="Ukupan volumen"
            value={`${Math.round(stats.totalVolume)} kg`}
          />
          <StatTile
            icon={<Check className="h-4 w-4" />}
            label="Završenih serija"
            value={String(stats.completedSets)}
          />
          <StatTile
            icon={<Heart className="h-4 w-4" />}
            label="Prosečan puls"
            value={stats.hrAvg ? `${stats.hrAvg} bpm` : "—"}
          />
        </div>

        {/* Uvek vidljive (sat upise kcal/HR par sekundi posle finish-a; "—" dok ne stigne). */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <StatTile
            icon={<Heart className="h-4 w-4" />}
            label="Max puls"
            value={stats.hrMax ? `${stats.hrMax} bpm` : "—"}
          />
          <StatTile
            icon={<Flame className="h-4 w-4" />}
            label="Aktivne kcal"
            value={stats.kcal ? `${Math.round(stats.kcal)} kcal` : "—"}
          />
        </div>

        {/* Zone pulsa - IZNAD "Po vezbi", samo kad ima HR podatka (zone se racunaju iz
            hr_series; bez sata sve su 0 -> sekcija se ne prikazuje). Isti izvor/komponenta
            kao InApp dialog. */}
        {zones.some((z) => z.seconds_in_zone > 0) && (
          <section className="mt-7">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-3">
              Zone pulsa
            </h2>
            <div className="rounded-3xl bg-surface border border-hairline p-4">
              <HRZonesChart zones={zones} />
            </div>
          </section>
        )}

        {/* Exercises summary */}
        <section className="mt-7">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-3">
            Po vežbi
          </h2>
          <div className="rounded-3xl bg-surface border border-hairline overflow-hidden">
            {exerciseSummaries.length === 0 && (
              <div className="px-4 py-6 text-[13px] text-muted-foreground text-center">
                Nema podataka.
              </div>
            )}
            {exerciseSummaries.map((ex) => (
              <div
                key={ex.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-hairline last:border-b-0"
              >
                <div className="h-9 w-9 rounded-2xl bg-primary-soft text-primary flex items-center justify-center shrink-0">
                  <Dumbbell className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-foreground truncate">
                    {ex.name}
                  </div>
                  {ex.isDuration ? (
                    ex.durationMinutes != null ? (
                      <div className="text-[12px] text-muted-foreground">{ex.durationMinutes} min</div>
                    ) : null
                  ) : (
                    <div className="text-[12px] text-muted-foreground">
                      {ex.doneSets}/{ex.totalSets} serija · {ex.reps} ponavljanja
                      {ex.maxWeight > 0 ? ` · ${ex.maxWeight} kg` : ""}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Note button */}
        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className="w-full mt-6 inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-surface border border-hairline text-[14px] font-semibold active:scale-[0.98] transition"
        >
          <MessageSquare className="h-4 w-4" />
          {session.notes ? "Izmeni komentar treneru" : "Pošalji treneru komentar"}
        </button>

        {session.notes && (
          <div className="mt-3 rounded-2xl bg-surface-2 border border-hairline p-3 text-[13px] text-muted-foreground whitespace-pre-line">
            {session.notes}
          </div>
        )}

        <button
          type="button"
          onClick={() => nav("/vezbac")}
          className="w-full mt-8 h-14 rounded-2xl bg-gradient-brand text-white font-bold text-[15px] inline-flex items-center justify-center shadow-brand active:scale-[0.98] transition"
        >
          Vrati se na početnu
        </button>
      </div>

      <FullScreenSheet open={noteOpen} onClose={() => setNoteOpen(false)} title="Komentar treneru">
        <FullScreenSheetScroll className="pt-5 space-y-2">
          <p className="text-sm text-muted-foreground">
            Kratko opiši kako se trening osetio, šta je bilo teško ili lako.
          </p>
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={5}
            placeholder="npr. Squat je bio težak, levo koleno me malo žuljalo."
            autoFocus
          />
        </FullScreenSheetScroll>
        <FullScreenSheetFooter>
          <button
            type="button"
            onClick={saveNote}
            disabled={savingNote}
            className="w-full h-11 rounded-xl bg-gradient-brand text-white text-[14px] font-bold shadow-brand disabled:opacity-60"
          >
            {savingNote ? "Čuvanje..." : "Sačuvaj"}
          </button>
        </FullScreenSheetFooter>
      </FullScreenSheet>
    </div>
  );
};

const StatTile = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <div className="rounded-2xl bg-surface border border-hairline p-4">
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      <span className="text-primary">{icon}</span>
      {label}
    </div>
    <div className="font-display text-[24px] font-bold tracking-tightest tnum mt-1.5 text-foreground">
      {value}
    </div>
  </div>
);

export default WorkoutSummary;
