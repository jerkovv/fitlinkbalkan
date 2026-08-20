import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { porukaGreske } from "@/lib/errorMessage";
import { SetLogger } from "@/components/workout/SetLogger";
import { ExerciseHeader } from "@/components/workout/ExerciseHeader";
import { RestOfWorkout } from "@/components/workout/RestOfWorkout";

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
  exercises: PlanExercise[];
};

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
}: {
  sessionId: string;
  /** Menja se kad trener doda ili promeni vezbu - okidac za ponovno citanje. */
  planVersion: number | null;
  currentIdx: number | null;
  currentSetNumber: number | null;
  disabled?: boolean;
  /** Roditelju treba broj vezbi za zaglavlje ("Vezba 2 od 5"), a plan se cita ovde. */
  onPlan?: (info: { ukupno: number; totalSets: number | null }) => void;
}) => {
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [salje, setSalje] = useState(false);
  // Indeks kroz ref: ucitaj() ga cita, a ne sme da mu bude u zavisnostima
  // (inace se efekat vrti na svakoj promeni pozicije).
  const idxRef = useRef(0);
  idxRef.current = currentIdx ?? 0;

  const ucitaj = useCallback(async () => {
    const { data } = await supabase.rpc("get_session_plan_full" as any, {
      p_session_id: sessionId,
    });
    const p = (Array.isArray(data) ? data[0] : data) as SessionPlan | null;
    // Prazan odgovor (mreza, RLS) NE sme da obrise vezbe pod rukama.
    if (p) {
      setPlan((stari) => (p.exercises?.length || !stari ? p : stari));
      const n = p.exercises?.length ?? 0;
      if (n) onPlan?.({ ukupno: n, totalSets: p.exercises[Math.min(idxRef.current, n - 1)]?.sets ?? null });
    }
  }, [sessionId, onPlan]);

  useEffect(() => {
    void ucitaj();
  }, [ucitaj, planVersion]);

  const vezbe = plan?.exercises ?? [];
  if (!vezbe.length) return null;

  const idx = currentIdx ?? 0;
  const trenutna = vezbe[idx];
  const setNumber = currentSetNumber ?? 1;
  const cilj = trenutna ? ciljSerije(trenutna, setNumber) : null;

  const zavrsiSeriju = async (d: { reps: number; weight_kg: number; rpe: number | null }) => {
    setSalje(true);
    const { error } = await supabase.rpc("athlete_complete_set" as any, {
      p_session_id: sessionId,
      p_reps: d.reps,
      p_weight: d.weight_kg,
      p_rpe: d.rpe,
    });
    setSalje(false);
    if (error) { toast.error(porukaGreske(error)); return; }
    await ucitaj();
  };

  return (
    <div className="w-full pb-6 space-y-4">
      {/* Prvo VEZBA koja se radi - video, naziv, uputstvo. Isto sto vezbac ima u
          klasicnom treningu; bez ovoga trener doda vezbu, a vezbac nema gde da
          vidi kako se radi. */}
      {trenutna && (
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

      {trenutna && cilj && (
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
    </div>
  );
};

export default FreeWorkoutExercises;
