import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { porukaGreske } from "@/lib/errorMessage";
import { pgTsToMs } from "@/lib/time";
import { SetLogger } from "@/components/workout/SetLogger";
import { ExerciseHeader } from "@/components/workout/ExerciseHeader";
import { RestOfWorkout } from "@/components/workout/RestOfWorkout";
import { RestTimer } from "@/components/workout/RestTimer";

type SetDetail = {
  set_number: number;
  reps: string | null;
  weight_kg: number | null;
};

type PlanExercise = {
  id: string;
  position: number;
  sets: number;
  reps: number | null;
  weight_kg: number | null;
  duration_minutes: number | null;
  set_details: SetDetail[] | null;
  exercise_id: string;
  exercise: {
    name: string;
    name_en: string | null;
    primary_muscle: string | null;
    thumbnail_url: string | null;
    video_url: string | null;
    instructions: string | null;
    is_duration_based: boolean | null;
  };
};

type SessionPlan = {
  is_free?: boolean;
  /** true = sve zadate serije su odradjene. Trening i dalje traje. */
  plan_complete?: boolean;
  exercises: PlanExercise[];
};

/** Isti prag kao RT_POS_GUARD_MS u ActiveWorkout.tsx - jedan mozak, jedna vrednost. */
const RT_POS_GUARD_MS = 1500;

/** Cilj bas te serije: per-set red je izvor istine, parent je rezerva. */
const ciljSerije = (ex: PlanExercise, setNumber: number) => {
  const d = ex.set_details?.find((s) => s.set_number === setNumber);
  const repsTekst = d?.reps ?? (ex.reps != null ? String(ex.reps) : null);
  // Cilj ume da bude raspon ("6-10") - stepper trazi broj, pa raspon ide u null.
  const reps = repsTekst && /^[0-9]+$/.test(repsTekst) ? Number(repsTekst) : null;
  const weight = d?.weight_kg ?? ex.weight_kg ?? null;
  return { reps, repsTekst, weight: weight != null ? Number(weight) : null };
};

/**
 * Vezbe u SLOBODNOM treningu.
 *
 * Slobodan trening pocinje bez ijedne vezbe i takav i ostaje dok mu trener
 * usred treninga ne doda vezbe (vezbe sesije, day_id NULL). Zato se cela
 * sekcija ne renderuje dok ih nema - da ekran onome ko trci na traci ostane
 * cist kakav je i bio.
 *
 * Upis serije ide kroz athlete_complete_set, ISTI RPC kao u planiranom
 * treningu: on radi po sesiji, a pozicija se racuna iz vezbi sesije, pa za
 * slobodan trening nije trebala nikakva posebna putanja.
 */
export const FreeWorkoutExercises = ({
  sessionId,
  planVersion,
  currentIdx,
  currentSetNumber,
  disabled,
  onPlan,
  liveState,
  restEndsAtIso,
}: {
  sessionId: string;
  /** Menja se kad trener doda ili promeni vezbu - okidac za ponovno citanje. */
  planVersion: number | null;
  currentIdx: number | null;
  currentSetNumber: number | null;
  disabled?: boolean;
  /** Roditelju treba broj vezbi za zaglavlje ("Vezba 2 od 5"), a plan se cita ovde. */
  onPlan?: (info: { ukupno: number; totalSets: number | null; zavrseno: boolean }) => void;
  /** current_state iz zivog reda: 'rest' znaci da traje pauza. */
  liveState?: string | null;
  /** rest_ends_at iz zivog reda (ISO), rezerva kad nemamo lokalni kraj. */
  restEndsAtIso?: string | null;
}) => {
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [salje, setSalje] = useState(false);
  // Indeks kroz ref: ucitaj() ga cita, a ne sme da mu bude u zavisnostima
  // (inace se efekat vrti na svakoj promeni pozicije).
  const idxRef = useRef(0);
  idxRef.current = currentIdx ?? 0;
  // Kraj pauze u LOKALNIM ms. Racuna se iz rest_seconds koje vrati sam RPC, pa
  // nema poredjenja serverskog sata sa telefonskim - to je u WKWebView-u vec
  // pravilo probleme. Serverski rest_ends_at je samo rezerva za povratak u
  // trening (osvezena stranica, pauzu pokrenuo sat).
  const [restEndsAtMs, setRestEndsAtMs] = useState<number | null>(null);
  // Kraj pauze i kroz ref: efekat ga CITA, a ne sme da mu bude u zavisnostima.
  // Sa restEndsAtMs u deps efekat se ponovo pokrene cim zavrsiSeriju postavi
  // lokalno sidro, a prop liveState je tada jos uvek 'active' (realtime i poll
  // nisu stigli) - pa linija koja gasi tajmer obrise tek upaljenu pauzu. Isti
  // simptom je vec resen u ActiveWorkout.tsx (vidi komentar uz RT_POS_GUARD_MS).
  const restRef = useRef<number | null>(null);
  restRef.current = restEndsAtMs;
  // Vreme poslednje SOPSTVENE akcije. Dok traje, zaostali dogadjaj sa starim
  // stanjem se ignorise. Ista vrednost i ime kao RT_POS_GUARD_MS u ActiveWorkout.
  const lastActionAtRef = useRef(0);

  const ucitaj = useCallback(async () => {
    const { data } = await supabase.rpc("get_session_plan_full" as any, {
      p_session_id: sessionId,
    });
    const p = (Array.isArray(data) ? data[0] : data) as SessionPlan | null;
    // Prazan odgovor (mreza, RLS) NE sme da obrise vezbe pod rukama.
    if (p) {
      setPlan((stari) => (p.exercises?.length || !stari ? p : stari));
      const n = p.exercises?.length ?? 0;
      if (n) onPlan?.({
        ukupno: n,
        totalSets: p.exercises[Math.min(idxRef.current, n - 1)]?.sets ?? null,
        zavrseno: p.plan_complete === true,
      });
    }
  }, [sessionId, onPlan]);

  useEffect(() => {
    void ucitaj();
  }, [ucitaj, planVersion]);

  // Zivi red je izvor istine za "da li pauza traje", ali sa dve brane koje su u
  // klasicnom treningu vec dokazane:
  //  1) posle SOPSTVENE akcije 1.5s se ignorise zaostali dogadjaj sa starim stanjem;
  //  2) dok je lokalna pauza SVEZA (kraj u buducnosti), dogadjaj koji nije 'rest' se
  //     odbacuje umesto da gasi tajmer - inace zakasneli 'active' izbaci coveka iz
  //     pauze pa mu sledeci klik potrosi SLEDECU seriju.
  // Tajmer gasi istek odbrojavanja ili legitiman izlazak koji stigne posle brane.
  useEffect(() => {
    const svezaPauza = restRef.current != null && restRef.current > Date.now();
    if (liveState !== "rest") {
      if (Date.now() - lastActionAtRef.current < RT_POS_GUARD_MS) return;
      if (svezaPauza) return;
      setRestEndsAtMs(null);
      return;
    }
    // Serverski kraj sme samo da PRODUZI, nikad da skrati - lokalno sidro iz
    // rest_seconds je tacnije od parsiranja tudjeg sata.
    const kraj = pgTsToMs(restEndsAtIso);
    if (kraj == null) return;
    const preostalo = kraj - Date.now();
    if (preostalo <= 0 || preostalo > 60 * 60 * 1000) return;
    setRestEndsAtMs((stari) => (stari == null ? kraj : Math.max(stari, kraj)));
  }, [liveState, restEndsAtIso]);

  const vezbe = plan?.exercises ?? [];
  if (!vezbe.length) return null;
  // Spisak gotov: sklanja se i vezba i upis, da vezbac ne moze da klikne seriju
  // koje nema (server bi vratio already_done, a ekran bi izgledao zaglavljeno).
  const zavrseno = plan?.plan_complete === true;

  const idx = currentIdx ?? 0;
  const trenutna = vezbe[idx];
  const setNumber = currentSetNumber ?? 1;
  const cilj = trenutna ? ciljSerije(trenutna, setNumber) : null;

  const preskociPauzu = async () => {
    lastActionAtRef.current = Date.now();
    setRestEndsAtMs(null);
    const { error } = await supabase.rpc("athlete_skip_rest" as any, { p_session_id: sessionId });
    if (error) toast.error(porukaGreske(error));
  };

  const produziPauzu = async (sekundi: number) => {
    lastActionAtRef.current = Date.now();
    setRestEndsAtMs((k) => (k != null ? k + sekundi * 1000 : k));
    const { error } = await supabase.rpc("athlete_extend_rest" as any, {
      p_session_id: sessionId, p_seconds: sekundi,
    });
    if (error) toast.error(porukaGreske(error));
  };

  const zavrsiSeriju = async (d: { reps: number; weight_kg: number; rpe: number | null }) => {
    lastActionAtRef.current = Date.now();
    setSalje(true);
    const { data, error } = await supabase.rpc("athlete_complete_set" as any, {
      p_session_id: sessionId,
      p_reps: d.reps,
      p_weight: d.weight_kg,
      p_rpe: d.rpe,
    });
    setSalje(false);
    if (error) { toast.error(porukaGreske(error)); return; }
    // 'free_plan_done' = spisak je gotov, ali trening TRAJE. Nema pauze, nema
    // rezimea; ucitaj() ispod donese plan_complete pa roditelj postavi pitanje.
    const r = data as { state?: string; rest_seconds?: number } | null;
    if (r?.state === "rest" && typeof r.rest_seconds === "number" && r.rest_seconds > 0) {
      setRestEndsAtMs(Date.now() + r.rest_seconds * 1000);
      lastActionAtRef.current = Date.now();
    }
    await ucitaj();
  };

  return (
    <div className="w-full pb-6 space-y-4">
      {/* Prvo VEZBA koja se radi - video, naziv, uputstvo. Isto sto vezbac ima u
          klasicnom treningu; bez ovoga trener doda vezbu, a vezbac nema gde da
          vidi kako se radi. */}
      {trenutna && !zavrseno && (
        <ExerciseHeader
          exerciseId={trenutna.exercise_id}
          name={trenutna.exercise.name}
          nameEn={trenutna.exercise.name_en}
          primaryMuscle={trenutna.exercise.primary_muscle}
          thumbnailUrl={trenutna.exercise.thumbnail_url}
          videoUrl={trenutna.exercise.video_url}
          instructions={trenutna.exercise.instructions}
        />
      )}

      {trenutna && cilj && !zavrseno && (
        salje ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <SetLogger
            key={`${idx}-${setNumber}`}
            setNumber={setNumber}
            totalSets={trenutna.sets}
            targetReps={cilj.reps}
            targetWeightKg={cilj.weight}
            onComplete={zavrsiSeriju}
            disabled={disabled}
          />
        )
      )}

      {/* Ceo spisak ISPOD i sklopljen, isti obrazac kao u klasicnom treningu:
          usred serije se gleda serija, a spisak je tu kad zatreba. */}
      <RestOfWorkout vezbe={vezbe} currentIdx={idx} />

      {/* Pauza je do sada postojala samo na satu: motor je upisivao rest u zivi
          red, a slobodan ekran ga nikad nije citao. Isti tajmer kao u klasicnom
          treningu. */}
      {restEndsAtMs != null && (
        <RestTimer
          endsAt={restEndsAtMs}
          subtitle={
            trenutna
              ? `Sledeća serija ${Math.min(setNumber, trenutna.sets)} od ${trenutna.sets}`
              : undefined
          }
          onDone={() => void preskociPauzu()}
          onAddSeconds={(sek) => void produziPauzu(sek)}
          disabled={disabled}
        />
      )}
    </div>
  );
};

export default FreeWorkoutExercises;
