import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Dumbbell, History, Loader2, Play, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useLastPerformance } from "@/hooks/useLastPerformance";

type SetDetail = {
  set_number: number;
  reps: string | null;
  weight_kg: number | null;
};

type PreviewExercise = {
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
    primary_muscle: string | null;
    is_duration_based: boolean | null;
  };
};

type DayFull = {
  day_id: string;
  day_name: string | null;
  day_number: number | null;
  exercises: PreviewExercise[];
};

/** "4 x 8-12 · 50 kg", ili "20 min" za vezbe na minute. */
const ciljTekst = (ex: PreviewExercise): string => {
  if (ex.exercise.is_duration_based) {
    return ex.duration_minutes != null ? `${ex.duration_minutes} min` : "-";
  }
  const prvi = ex.set_details?.[0];
  const reps = prvi?.reps ?? (ex.reps != null ? String(ex.reps) : null);
  const kg = prvi?.weight_kg ?? ex.weight_kg;
  const delovi = [`${ex.set_details?.length || ex.sets} x ${reps ?? "-"}`];
  if (kg != null && Number(kg) > 0) delovi.push(`${Number(kg)} kg`);
  return delovi.join(" · ");
};

const setTekst = (s: { reps: number | null; weight_kg: number | null }): string => {
  const kg = s.weight_kg != null && Number(s.weight_kg) > 0 ? `${Number(s.weight_kg)} kg` : null;
  const reps = s.reps != null ? `x ${s.reps}` : null;
  return [kg, reps].filter(Boolean).join(" ") || "-";
};

/**
 * Pregled treninga PRE nego sto pocne.
 *
 * Do sada je tap na dan vodio pravo u ActiveWorkout, koji odmah zove
 * start_workout_session - dakle nije postojao nacin da vezbac samo pogleda sta
 * ga ceka. Posledica je bila merljiva: 110 od 311 treninga sa planom nema
 * nijednu upisanu seriju, a 93 su trajala manje od dva minuta. Svaki takav tap
 * je treneru na pocetnoj pisao "trenira sada" i ostavljao prazan trening u
 * istoriji.
 *
 * Trening zato krece TEK na dugme. Ako sesija za ovaj dan vec traje, pregled se
 * preskace - covek koji se vraca u zapocet trening ne sme da dobije jos jedan
 * ekran izmedju sebe i serije koju radi.
 */
export default function WorkoutPreview() {
  const { dayId } = useParams<{ dayId: string }>();
  const nav = useNavigate();
  const { user } = useAuth();

  const [day, setDay] = useState<DayFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [greska, setGreska] = useState<string | null>(null);

  const uTrening = useCallback(() => {
    if (dayId) nav(`/vezbac/trening/aktivan/${dayId}`, { replace: true });
  }, [dayId, nav]);

  useEffect(() => {
    if (!dayId || !user) return;
    let otkazano = false;

    (async () => {
      // Zapocet trening ima prednost nad pregledom.
      const { data: ziva } = await supabase
        .from("workout_session_logs")
        .select("id")
        .eq("day_id", dayId)
        .eq("athlete_id", user.id)
        .eq("is_active", true)
        .limit(1);
      if (otkazano) return;
      if (ziva && ziva.length > 0) { uTrening(); return; }

      const { data, error } = await supabase.rpc("get_workout_day_full", {
        p_day_id: dayId,
      } as any);
      if (otkazano) return;
      const d = (Array.isArray(data) ? data[0] : data) as DayFull | null;
      if (error || !d) {
        setGreska(error?.message ?? "Trening nije pronađen");
        setLoading(false);
        return;
      }
      setDay(d);
      setLoading(false);
    })();

    return () => { otkazano = true; };
  }, [dayId, user, uTrening]);

  const vezbe = day?.exercises ?? [];
  const { byExercise: prosliPut } = useLastPerformance(
    user?.id,
    vezbe.map((e) => e.exercise_id),
  );

  const ukupnoSerija = vezbe.reduce(
    (n, e) => n + (e.exercise.is_duration_based ? 0 : e.set_details?.length || e.sets),
    0,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (greska) {
    return (
      <div className="px-5 py-10 text-center">
        <div className="text-[14px] text-muted-foreground">{greska}</div>
        <button
          onClick={() => nav("/vezbac/trening", { replace: true })}
          className="mt-4 h-11 px-5 rounded-xl bg-surface-2 text-[13.5px] font-semibold"
        >
          Nazad
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="px-5 pt-3">
        <button
          onClick={() => nav("/vezbac/trening")}
          aria-label="Nazad"
          className="h-9 w-9 -ml-1 rounded-full bg-surface-2 inline-flex items-center justify-center"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.4} />
        </button>

        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {day?.day_number != null ? `Dan ${day.day_number}` : "Trening"}
          </div>
          <h1 className="font-display text-[26px] font-bold tracking-tighter leading-tight mt-0.5">
            {day?.day_name ?? "Trening"}
          </h1>
          <div className="text-[13px] text-muted-foreground mt-1 tnum">
            {vezbe.length} {vezbe.length === 1 ? "vežba" : "vežbi"}
            {ukupnoSerija > 0 && ` · ${ukupnoSerija} serija`}
          </div>
        </div>
      </div>

      {!vezbe.length ? (
        <div className="px-5 py-8 text-[13.5px] text-muted-foreground">
          Ovaj trening još nema vežbe.
        </div>
      ) : (
        <div className="px-5 mt-4 space-y-2">
          {vezbe.map((ex, i) => {
            const ime = ex.exercise.name_en?.trim() || ex.exercise.name;
            const istorija = prosliPut[ex.exercise_id];
            const rekord =
              istorija?.best_weight_kg != null && Number(istorija.best_weight_kg) > 0
                ? Number(istorija.best_weight_kg)
                : null;
            return (
              <div key={ex.id} className="rounded-xl border border-hairline bg-surface p-3">
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-lg bg-surface-2 text-muted-foreground flex items-center justify-center shrink-0 text-[11px] font-bold tnum">
                    {i + 1}
                  </div>

                  {ex.exercise.thumbnail_url ? (
                    <img
                      src={ex.exercise.thumbnail_url}
                      alt=""
                      loading="lazy"
                      className="h-11 w-11 rounded-lg object-cover bg-surface-2 shrink-0"
                    />
                  ) : (
                    <div className="h-11 w-11 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
                      <Dumbbell className="h-4 w-4 text-muted-foreground/60" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold truncate">{ime}</div>
                    <div className="text-[12px] text-muted-foreground truncate tnum">
                      {ciljTekst(ex)}
                      {ex.exercise.primary_muscle && ` · ${ex.exercise.primary_muscle}`}
                    </div>
                  </div>
                </div>

                {/* Sta je digao poslednji put za bas ovu vezbu - da zna odakle
                    krece, umesto da se seca u sali. */}
                {istorija?.performed_at && istorija.sets.length > 0 && (
                  <div className="mt-2 flex items-start gap-1.5 pl-[40px]">
                    <History
                      className="h-3 w-3 text-muted-foreground shrink-0 mt-[3px]"
                      strokeWidth={2.2}
                    />
                    <div className="flex flex-wrap items-center gap-1">
                      {istorija.sets.map((s) => (
                        <span
                          key={s.set_number}
                          className="inline-flex items-center rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium tnum text-muted-foreground"
                        >
                          {setTekst(s)}
                        </span>
                      ))}
                      {rekord != null && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground ml-0.5">
                          <Trophy className="h-3 w-3 text-warning shrink-0" strokeWidth={2.2} />
                          {rekord} kg
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Trening krece TEK odavde.
          U normalnom toku, ne "fixed": vezbacevi ekrani zive unutar PhoneShell-a,
          a fiksirani element unutar transformisanog pretka ne racuna pozicioniranje
          prema prozoru. Isti obrazac koristi i slobodan trening. */}
      <div
        className="px-5 pt-5"
        style={{ paddingBottom: "calc(max(env(safe-area-inset-bottom), 16px) + 12px)" }}
      >
        <button
          onClick={uTrening}
          disabled={!vezbe.length}
          className="w-full h-14 rounded-2xl bg-gradient-brand text-white font-bold text-[15px] inline-flex items-center justify-center gap-2 shadow-brand active:scale-[0.98] transition disabled:opacity-50"
        >
          <Play className="h-4 w-4" strokeWidth={3} fill="currentColor" />
          Počni trening
        </button>
      </div>
    </div>
  );
}
