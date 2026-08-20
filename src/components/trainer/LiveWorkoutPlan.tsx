import { useCallback, useEffect, useState } from "react";
import { Check, Dumbbell, History, Loader2, Pencil, Repeat2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { porukaGreske } from "@/lib/errorMessage";
import { useLastPerformance } from "@/hooks/useLastPerformance";
import { ExercisePickerSheet } from "@/components/exercises/ExercisePickerSheet";
import { Input } from "@/components/ui/input";

type SetDetail = {
  set_number: number;
  reps: string | null;
  weight_kg: number | null;
};

type DayExercise = {
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
    thumbnail_url: string | null;
    is_duration_based: boolean | null;
  };
};

type DayFull = {
  day_name: string;
  exercises: DayExercise[];
};

/** Serija upisana U OVOM treningu (set_logs). */
type DanasnjiSet = {
  exercise_id: string;      // assigned_program_exercises.id
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  logged_by_trainer: boolean;
};

/** "40 kg x 10" ili samo "x 10" za vezbe sa sopstvenom tezinom. */
const setTekst = (s: { reps: number | null; weight_kg: number | null }): string => {
  const kg = s.weight_kg != null && Number(s.weight_kg) > 0 ? `${Number(s.weight_kg)} kg` : null;
  const reps = s.reps != null ? `x ${s.reps}` : null;
  return [kg, reps].filter(Boolean).join(" ") || "-";
};

/** Cilj za danas, sazeto: "4 x 10 · 60 kg" ili "20 min". */
const ciljTekst = (ex: DayExercise): string => {
  if (ex.exercise.is_duration_based) {
    return ex.duration_minutes != null ? `${ex.duration_minutes} min` : "Trajanje";
  }
  const brojSetova = ex.set_details?.length || ex.sets;
  const prvi = ex.set_details?.[0];
  const reps = prvi?.reps ?? (ex.reps != null ? String(ex.reps) : null);
  const kg = prvi?.weight_kg ?? ex.weight_kg;
  const delovi = [`${brojSetova} x ${reps ?? "-"}`];
  if (kg != null && Number(kg) > 0) delovi.push(`${Number(kg)} kg`);
  return delovi.join(" · ");
};

/**
 * Spisak vezbi treninga koji vezbac UPRAVO radi, na trenerovom uzivo ekranu.
 * Za svaku vezbu: danasnji cilj i sta je vezbac poslednji put digao za bas nju,
 * da trener u sali odmah zna koji broj da mu zada.
 *
 * Trenutna vezba je istaknuta, odradjene su zacrtane.
 *
 * Slobodan trening nema vezbe (day_id je null - vidi _start_free_workout_session),
 * pa se komponenta tada uopste ne montira; roditelj prikazuje svoje stanje.
 */
export const LiveWorkoutPlan = ({
  sessionId,
  dayId,
  athleteId,
  currentIdx,
  currentSetNumber,
}: {
  sessionId: string;
  dayId: string;
  athleteId: string;
  currentIdx: number | null;
  /** Sluzi kao okidac za osvezavanje danasnjih serija kad vezbac zavrsi set. */
  currentSetNumber: number | null;
}) => {
  const [day, setDay] = useState<DayFull | null>(null);
  const [loading, setLoading] = useState(true);
  // Vezba koju trener menja (assigned_program_exercises.id), null = sheet zatvoren.
  const [menjam, setMenjam] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);
  // Serije upisane u ovom treningu, grupisane po vezbi.
  const [danas, setDanas] = useState<Record<string, DanasnjiSet[]>>({});
  // Unos za sledecu seriju (kg / ponavljanja).
  const [kg, setKg] = useState("");
  const [reps, setReps] = useState("");
  // Serija koju trener ispravlja: null = nijedna.
  const [ispravljam, setIspravljam] = useState<{ apeId: string; setNumber: number } | null>(null);

  const ucitaj = useCallback(async () => {
    // Isti RPC koji koristi i vezbacev ekran; trener sme da ga zove jer
    // funkcija propusta i p.trainer_id = auth.uid().
    const { data } = await supabase.rpc("get_workout_day_full" as any, { p_day_id: dayId });
    const d = (Array.isArray(data) ? data[0] : data) as DayFull | null;
    setDay(d ?? null);
    setLoading(false);
  }, [dayId]);

  // Serije upisane u OVOM treningu. Trener ih ima pravo da cita ("trainer reads
  // set logs" RLS politika). set_logs nije u realtime objavi, pa se osvezava kad
  // se promeni pozicija vezbaca - a ona se menja bas kad neko upise seriju.
  const ucitajDanas = useCallback(async () => {
    const { data } = await supabase
      .from("set_logs")
      .select("exercise_id, set_number, reps, weight_kg, logged_by_trainer")
      .eq("session_log_id", sessionId)
      .eq("done", true)
      .order("set_number");
    const grupisano: Record<string, DanasnjiSet[]> = {};
    for (const red of ((data ?? []) as DanasnjiSet[])) {
      (grupisano[red.exercise_id] ??= []).push(red);
    }
    setDanas(grupisano);
  }, [sessionId]);

  useEffect(() => {
    setLoading(true);
    void ucitaj();
  }, [ucitaj]);

  useEffect(() => {
    void ucitajDanas();
  }, [ucitajDanas, currentIdx, currentSetNumber]);

  // Zamena vezbe usred treninga. Server proverava da je sesija ziva, da je vezbac
  // bas ovog trenera i da vezba pripada BAS ovom danu, pa podigne plan_version -
  // sto je signal vezbacevom telefonu da ponovo ucita plan.
  const zameni = async (noviExerciseId: string) => {
    if (!menjam) return;
    setSalje(true);
    const { data, error } = await supabase.rpc("trainer_replace_exercise" as any, {
      p_session_id: sessionId,
      p_assigned_exercise_id: menjam,
      p_new_exercise_id: noviExerciseId,
    });
    setSalje(false);
    setMenjam(null);
    if (error) {
      toast.error(porukaGreske(error));
      return;
    }
    toast.success(`Zamenjeno: ${(data as any)?.name ?? "vežba"}`);
    await ucitaj();
  };

  const broj = (t: string): number | null => {
    const v = t.trim().replace(",", ".");
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // Trener belezi seriju koju je vezbac upravo odradio. Server sam bira KOJI je
  // set na redu (isto kao kad vezbac klikne), pa se broj upisanih serija i
  // pozicija ne mogu razici.
  const upisiSeriju = async () => {
    setSalje(true);
    const { error } = await supabase.rpc("trainer_log_next_set" as any, {
      p_session_id: sessionId,
      p_reps: broj(reps),
      p_weight: broj(kg),
    });
    setSalje(false);
    if (error) { toast.error(porukaGreske(error)); return; }
    setKg(""); setReps("");
    toast.success("Upisano");
    await ucitajDanas();
  };

  // Ispravka vec upisane serije (svoje ili vezbaceve). Menja samo brojeve -
  // broj odradjenih serija ostaje isti, pa vezbac ne skace na drugu poziciju.
  const ispraviSeriju = async () => {
    if (!ispravljam) return;
    setSalje(true);
    const { error } = await supabase.rpc("trainer_update_set" as any, {
      p_session_id: sessionId,
      p_assigned_exercise_id: ispravljam.apeId,
      p_set_number: ispravljam.setNumber,
      p_reps: broj(reps),
      p_weight: broj(kg),
    });
    setSalje(false);
    if (error) { toast.error(porukaGreske(error)); return; }
    setIspravljam(null); setKg(""); setReps("");
    toast.success("Izmenjeno");
    await ucitajDanas();
  };

  const vezbe = day?.exercises ?? [];
  const { byExercise: prosliPut } = useLastPerformance(
    athleteId,
    vezbe.map((e) => e.exercise_id),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!vezbe.length) {
    return (
      <div className="text-[13px] text-muted-foreground py-2">
        Ovaj trening nema vežbe.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {vezbe.map((ex, i) => {
        const trenutna = currentIdx != null && i === currentIdx;
        const odradjena = currentIdx != null && i < currentIdx;
        const ime = ex.exercise.name_en?.trim() || ex.exercise.name;
        const istorija = prosliPut[ex.exercise_id];
        const danasnje = danas[ex.id] ?? [];
        const ispravljamOvde = ispravljam?.apeId === ex.id;

        return (
          <div
            key={ex.id}
            className={cn(
              "rounded-xl border px-2.5 py-2 transition",
              trenutna
                ? "border-primary/40 bg-primary-soft"
                : "border-hairline bg-surface",
              odradjena && "opacity-55",
            )}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-bold tnum",
                  trenutna
                    ? "bg-gradient-brand text-white shadow-brand"
                    : "bg-surface-2 text-muted-foreground",
                )}
              >
                {odradjena ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
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
                <div
                  className={cn(
                    "text-[13.5px] font-semibold truncate",
                    trenutna && "text-primary-soft-foreground",
                  )}
                >
                  {ime}
                </div>
                <div className="text-[11.5px] text-muted-foreground truncate tnum">
                  {ciljTekst(ex)}
                </div>
              </div>

              {/* Zamena se nudi samo za vezbe koje jos nisu odradjene - menjanje
                  zavrsene vezbe bi prepisalo ono sto je vezbac vec uradio. */}
              {!odradjena && (
                <button
                  type="button"
                  onClick={() => setMenjam(ex.id)}
                  disabled={salje}
                  aria-label={`Zameni vežbu ${ime}`}
                  className="h-8 w-8 rounded-lg bg-surface-2 hover:bg-surface flex items-center justify-center shrink-0 transition disabled:opacity-50"
                >
                  <Repeat2 className="h-4 w-4 text-muted-foreground" strokeWidth={2.2} />
                </button>
              )}
            </div>

            {/* Sta je digao poslednji put za bas ovu vezbu - da trener zna
                koji broj danas da mu zada, bez otvaranja profila. */}
            {istorija?.performed_at && istorija.sets.length > 0 && (
              <div className="mt-1.5 flex items-start gap-1.5 pl-[38px]">
                <History
                  className="h-3 w-3 text-muted-foreground shrink-0 mt-[3px]"
                  strokeWidth={2.2}
                />
                <div className="flex flex-wrap gap-1">
                  {istorija.sets.map((s) => (
                    <span
                      key={s.set_number}
                      className="inline-flex items-center rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium tnum text-muted-foreground"
                    >
                      {setTekst(s)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* DANAS odradjeno. Tap na seriju je ispravka - trener sme da menja
                i svoj i vezbacev upis. Tackica oznacava sta je uneo trener. */}
            {danasnje.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1 pl-[38px]">
                {danasnje.map((d) => {
                  const bira = ispravljamOvde && ispravljam?.setNumber === d.set_number;
                  return (
                    <button
                      key={d.set_number}
                      type="button"
                      onClick={() => {
                        setIspravljam({ apeId: ex.id, setNumber: d.set_number });
                        setKg(d.weight_kg != null ? String(Number(d.weight_kg)) : "");
                        setReps(d.reps != null ? String(d.reps) : "");
                      }}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tnum transition",
                        bira
                          ? "bg-primary text-primary-foreground"
                          : "bg-success-soft text-success-soft-foreground",
                      )}
                    >
                      {d.logged_by_trainer && (
                        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                      )}
                      {setTekst(d)}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Unos: na TRENUTNOJ vezbi upisuje sledecu seriju, a kad je izabrana
                neka vec upisana - ispravlja bas nju. */}
            {(trenutna || ispravljamOvde) && (
              <div className="mt-2 flex items-center gap-1.5 pl-[38px]">
                <Input
                  value={kg}
                  onChange={(e) => setKg(e.target.value)}
                  inputMode="decimal"
                  placeholder="kg"
                  aria-label="Kilaža"
                  className="h-9 w-[68px] text-[13px] text-center"
                />
                <Input
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                  inputMode="numeric"
                  placeholder="ponav."
                  aria-label="Ponavljanja"
                  className="h-9 w-[74px] text-[13px] text-center"
                />
                <button
                  type="button"
                  disabled={salje}
                  onClick={() => void (ispravljamOvde ? ispraviSeriju() : upisiSeriju())}
                  className="h-9 flex-1 rounded-lg bg-gradient-brand text-white text-[12.5px] font-semibold shadow-brand disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
                  {salje ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : ispravljamOvde ? (
                    <><Pencil className="h-3.5 w-3.5" strokeWidth={2.4} />Izmeni</>
                  ) : (
                    <><Check className="h-3.5 w-3.5" strokeWidth={3} />Upiši seriju</>
                  )}
                </button>
                {ispravljamOvde && (
                  <button
                    type="button"
                    onClick={() => { setIspravljam(null); setKg(""); setReps(""); }}
                    className="h-9 px-3 rounded-lg bg-surface-2 text-[12.5px] font-semibold text-muted-foreground"
                  >
                    Otkaži
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Isti birac vezbi kao u builderu, u rezimu zamene (onPick) - bira se
          jedna vezba i vraca ovamo umesto da se dodaje u dan. */}
      <ExercisePickerSheet
        open={menjam !== null}
        dayId={dayId}
        dayName="Zameni vežbu"
        table="assigned_program_exercises"
        onClose={() => setMenjam(null)}
        onAdded={() => setMenjam(null)}
        onPick={(exerciseId) => void zameni(exerciseId)}
      />
    </div>
  );
};

export default LiveWorkoutPlan;
