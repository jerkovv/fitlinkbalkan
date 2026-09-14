import { forwardRef, useState } from "react";
import { Bookmark, Check, Maximize2, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { MUSCLE_LABELS, type MuscleGroupId } from "@/lib/muscleGroups";
import { hasExerciseVideo } from "@/lib/exerciseMedia";
import { MuscleGroupIcon } from "./MuscleGroupIcon";

export type PickerExercise = {
  id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  primary_muscle: string;
  thumbnail_url: string | null;
  video_url: string | null;
};

type Props = {
  exercise: PickerExercise;
  selected: boolean;
  bookmarked: boolean;
  onToggleSelect: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  index?: number;
  variant?: "grid" | "row";
  /** Prikazi misicnu grupu ispod naziva. Iskljuci kad je cela lista ionako ta grupa. */
  showMuscle?: boolean;
  /** Otvori pregled vezbe (snimak). Bez njega se dugme ne prikazuje. */
  onPreview?: (exercise: PickerExercise) => void;
};

// Dugmici u uglovima slike (bookmark gore levo, pregled dole desno): isti beli krug
// sa blagom senkom, da se na beloj slici vide cisto i citaju kao par.
const CORNER_BTN =
  "h-7 w-7 rounded-full bg-background/95 shadow-[0_1px_3px_rgba(0,0,0,0.14)] ring-1 ring-black/[0.04] flex items-center justify-center text-foreground transition hover:bg-background active:scale-95";

const Placeholder = forwardRef<HTMLDivElement, { muscle: string }>(
  ({ muscle }, ref) => (
    <div
      ref={ref}
      className="absolute inset-0 bg-gradient-brand-soft flex items-center justify-center"
    >
      <div className="opacity-60 text-primary">
        <MuscleGroupIcon muscle={muscle as MuscleGroupId} active />
      </div>
    </div>
  )
);
Placeholder.displayName = "Placeholder";

export const ExerciseCard = ({
  exercise,
  selected,
  bookmarked,
  onToggleSelect,
  onToggleBookmark,
  index = 0,
  variant = "grid",
  showMuscle = true,
  onPreview,
}: Props) => {
  const [imgFailed, setImgFailed] = useState(false);
  // Pregled se otvara za svaku vezbu. Ikonica kaze sta se otvara: play za snimak,
  // strelice za uvecanje kad vezba ima samo sliku.
  const video = hasExerciseVideo(exercise);
  const pregledLabel = video ? "Pogledaj snimak vežbe" : "Uvećaj sliku vežbe";
  const primaryName = exercise.name_en?.trim() || exercise.name;
  const subtitle =
    exercise.description?.trim() ||
    MUSCLE_LABELS[exercise.primary_muscle] ||
    exercise.primary_muscle;
  const showImage = !!exercise.thumbnail_url && !imgFailed;

  if (variant === "row") {
    return (
      <button
        onClick={() => onToggleSelect(exercise.id)}
        className={cn(
          "w-full flex items-center gap-3 p-2 rounded-xl transition active:scale-[0.99]",
          selected
            ? "bg-primary-soft/30 ring-1 ring-primary"
            : "hover:bg-surface-2"
        )}
      >
        <div className="h-16 w-16 rounded-lg bg-surface-2 relative shrink-0 overflow-hidden">
          {showImage ? (
            <img
              src={exercise.thumbnail_url!}
              alt={primaryName}
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="object-cover w-full h-full"
            />
          ) : (
            <Placeholder muscle={exercise.primary_muscle} />
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-semibold tracking-tight line-clamp-1">
            {primaryName}
          </div>
          <div className="text-xs text-muted-foreground line-clamp-1">
            {subtitle}
          </div>
        </div>
        {onPreview && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPreview(exercise);
            }}
            aria-label={pregledLabel}
            className="h-8 w-8 rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground flex items-center justify-center shrink-0 transition"
          >
            {video ? (
              <Play size={13} className="ml-px" fill="currentColor" strokeWidth={0} />
            ) : (
              <Maximize2 size={14} strokeWidth={2.25} />
            )}
          </button>
        )}
        {selected && (
          <div className="h-7 w-7 rounded-full bg-gradient-brand flex items-center justify-center shrink-0">
            <Check size={14} className="text-primary-foreground" strokeWidth={3} />
          </div>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={() => onToggleSelect(exercise.id)}
      className={cn(
        "card-premium-hover rounded-xl overflow-hidden relative text-left animate-fade-in active:scale-[0.98] transition-transform flex flex-col w-full h-full",
        selected && "ring-2 ring-primary"
      )}
      style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
    >
      {/* 3:2 = format slicica (800x533) na beloj pozadini: slika ispuni okvir. U 4:3
          sivom okviru su ostajale sive trake oko bele slike, kao dupli ram. */}
      <div className="aspect-[3/2] w-full bg-white relative overflow-hidden shrink-0 border-b border-hairline">
        {showImage ? (
          <img
            src={exercise.thumbnail_url!}
            alt={primaryName}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-contain"
          />
        ) : (
          <Placeholder muscle={exercise.primary_muscle} />
        )}

        {selected && (
          <div className="absolute inset-0 bg-primary-soft/30 pointer-events-none" />
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleBookmark(exercise.id);
          }}
          aria-label={bookmarked ? "Ukloni iz sačuvanih" : "Sačuvaj vežbu"}
          className={cn("absolute top-2 left-2", CORNER_BTN)}
        >
          <Bookmark
            size={14}
            className={bookmarked ? "text-primary" : "text-foreground"}
            fill={bookmarked ? "currentColor" : "none"}
          />
        </button>

        {selected && (
          <div className="absolute top-2 right-2 h-7 w-7 rounded-full bg-gradient-brand flex items-center justify-center animate-scale-in">
            <Check size={14} className="text-primary-foreground" strokeWidth={3} />
          </div>
        )}

        {onPreview && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPreview(exercise);
            }}
            aria-label={pregledLabel}
            className={cn("absolute bottom-2 right-2", CORNER_BTN)}
          >
            {video ? (
              <Play size={11} className="ml-px" fill="currentColor" strokeWidth={0} />
            ) : (
              <Maximize2 size={12} strokeWidth={2.25} />
            )}
          </button>
        )}
      </div>
      {/* Fiksne visine teksta: bez njih kartica sa naslovom u dva reda razvuce
          ceo red i mreza izgleda krivo. */}
      <div className="p-3">
        <div className="text-sm font-semibold tracking-tight leading-snug line-clamp-2 min-h-[2.4rem]">
          {exercise.name}
        </div>
        <div className="h-4 mt-0.5 text-xs text-muted-foreground line-clamp-1">
          {exercise.name_en}
        </div>
        {showMuscle && (
          <div className="text-[11px] text-muted-foreground/70 font-medium pt-1 capitalize">
            {MUSCLE_LABELS[exercise.primary_muscle as MuscleGroupId] || exercise.primary_muscle}
          </div>
        )}
      </div>
    </button>
  );
};
