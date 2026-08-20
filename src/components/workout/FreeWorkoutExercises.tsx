import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Dumbbell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { porukaGreske } from "@/lib/errorMessage";
import { SetLogger } from "@/components/workout/SetLogger";
import { ExerciseHeader } from "@/components/workout/ExerciseHeader";

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
    <div className="w-full pb-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-2.5">
        Vežbe koje ti je trener dodao
      </div>

      <div className="rounded-xl border border-hairline bg-surface divide-y divide-hairline mb-4">
        {vezbe.map((ex, i) => {
          // Vezbacu SRPSKI naziv. Engleski se ovde namerno ne prikazuje: red je
          // zbijen, a spisak ide i do 10 vezbi - drugi red imena bi ga izduzio.
          // U pregledu pre treninga, gde ima mesta, stoje oba.
          const ime = ex.exercise.name;
          const aktivna = i === idx;
          const gotova = i < idx;
          return (
            <div
              key={ex.id}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2.5",
                aktivna && "bg-primary-soft",
                gotova && "opacity-55",
              )}
            >
              <div
                className={cn(
                  "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-bold tnum",
                  aktivna
                    ? "bg-gradient-brand text-white shadow-brand"
                    : "bg-surface-2 text-muted-foreground",
                )}
              >
                {gotova ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </div>

              {ex.exercise.thumbnail_url ? (
                <img
                  src={ex.exercise.thumbnail_url}
                  alt=""
                  loading="lazy"
                  className="h-9 w-9 rounded-lg object-cover bg-surface-2 shrink-0"
                />
              ) : (
                <div className="h-9 w-9 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
                  <Dumbbell className="h-4 w-4 text-muted-foreground/60" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                {/* Bez truncate: nazivi vezbi su dugi ("Potisak sa klupe sa
                    sipkom na kosoj klupi") i sa sasecanjem se ne razlikuju.
                    Prelama se u najvise dva reda. */}
                <div className={cn("text-[13.5px] font-semibold leading-snug line-clamp-2",
                                   aktivna && "text-primary-soft-foreground")}>
                  {ime}
                </div>
                <div className="text-[11.5px] text-muted-foreground tnum">
                  {ex.sets} x {ciljSerije(ex, 1).repsTekst ?? "-"}
                  {ciljSerije(ex, 1).weight != null && ciljSerije(ex, 1).weight! > 0
                    ? ` · ${ciljSerije(ex, 1).weight} kg`
                    : ""}
                </div>
              </div>

              {aktivna && (
                <div className="text-[11.5px] font-semibold text-primary tnum shrink-0">
                  {Math.min(setNumber, ex.sets)}/{ex.sets}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Video i uputstvo TRENUTNE vezbe - isto sto vezbac ima u klasicnom
          treningu. Bez ovoga trener doda vezbu, a vezbac nema gde da vidi kako
          se radi. */}
      {trenutna && (
        <div className="mb-4">
          <ExerciseHeader
            exerciseId={trenutna.exercise_id}
            name={trenutna.exercise.name}
            nameEn={trenutna.exercise.name_en}
            primaryMuscle={trenutna.exercise.primary_muscle}
            thumbnailUrl={trenutna.exercise.thumbnail_url}
            videoUrl={trenutna.exercise.video_url}
            instructions={trenutna.exercise.instructions}
          />
        </div>
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
    </div>
  );
};

export default FreeWorkoutExercises;
