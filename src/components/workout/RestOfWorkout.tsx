import { useState } from "react";
import { Check, ChevronDown, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";

type SetDetail = {
  set_number: number;
  reps: string | null;
  weight_kg: number | null;
};

type Vezba = {
  id: string;
  sets: number;
  reps: number | null;
  weight_kg: number | null;
  duration_minutes: number | null;
  set_details: SetDetail[] | null;
  exercise: {
    name: string;
    name_en: string | null;
    thumbnail_url: string | null;
    is_duration_based: boolean | null;
  };
};

const ciljTekst = (ex: Vezba): string => {
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

/**
 * Ceo trening, dok vezbac trenira.
 *
 * Ekran je do sada pokazivao samo TRENUTNU vezbu i ime sledece, a prosecan dan
 * ima 4,7 vezbi (najvise 10, a 54 od 102 dana ima pet ili vise). Covek usred
 * trece vezbe nije mogao da zna da li ga ceka jos jedna ili jos pet - a od toga
 * zavisi kako rasporedi snagu.
 *
 * Sklopljeno je podrazumevano: usred serije se gleda serija, ne spisak. Zaglavlje
 * nosi napredak ("3/5 vežbi"), pa i sklopljeno nesto govori.
 */
export const RestOfWorkout = ({
  vezbe,
  currentIdx,
}: {
  vezbe: Vezba[];
  currentIdx: number;
}) => {
  const [otvoreno, setOtvoreno] = useState(false);
  if (vezbe.length <= 1) return null;

  return (
    <div className="rounded-2xl border border-hairline bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOtvoreno((v) => !v)}
        aria-expanded={otvoreno}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Ceo trening
          </span>
          <span className="block text-[13.5px] font-semibold tnum">
            {Math.min(currentIdx + 1, vezbe.length)}/{vezbe.length} vežbi
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform",
            otvoreno && "rotate-180",
          )}
          strokeWidth={2.4}
        />
      </button>

      {otvoreno && (
        <div className="border-t border-hairline divide-y divide-hairline">
          {vezbe.map((ex, i) => {
            const ime = ex.exercise.name_en?.trim() || ex.exercise.name;
            const gotova = i < currentIdx;
            const aktivna = i === currentIdx;
            return (
              <div
                key={ex.id}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-2.5",
                  aktivna && "bg-primary-soft",
                  gotova && "opacity-55",
                )}
              >
                <div
                  className={cn(
                    "h-6 w-6 rounded-lg flex items-center justify-center shrink-0 text-[10.5px] font-bold tnum",
                    aktivna
                      ? "bg-gradient-brand text-white shadow-brand"
                      : "bg-surface-2 text-muted-foreground",
                  )}
                >
                  {gotova ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                </div>

                {ex.exercise.thumbnail_url ? (
                  <img
                    src={ex.exercise.thumbnail_url}
                    alt=""
                    loading="lazy"
                    className="h-8 w-8 rounded-lg object-cover bg-surface-2 shrink-0"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
                    <Dumbbell className="h-3.5 w-3.5 text-muted-foreground/60" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "text-[13px] font-semibold truncate",
                      aktivna && "text-primary-soft-foreground",
                    )}
                  >
                    {ime}
                  </div>
                  <div className="text-[11.5px] text-muted-foreground truncate tnum">
                    {ciljTekst(ex)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RestOfWorkout;
