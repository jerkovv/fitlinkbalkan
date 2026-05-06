import { forwardRef, useState } from "react";
import { Bookmark, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { MUSCLE_LABELS, type MuscleGroupId } from "@/lib/muscleGroups";
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
};

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
}: Props) => {
  const [imgFailed, setImgFailed] = useState(false);
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
        "card-premium-hover rounded-xl overflow-hidden relative text-left animate-fade-in active:scale-[0.98] transition-transform block w-full",
        selected && "ring-2 ring-primary"
      )}
      style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
    >
      <div className="aspect-[3/2] w-full bg-surface-2 relative overflow-hidden">
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
          className="absolute top-2 left-2 h-7 w-7 rounded-full bg-background/60 backdrop-blur-md flex items-center justify-center"
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
      </div>
      <div className="p-3">
        <div className="text-sm font-semibold tracking-tight line-clamp-1">
          {primaryName}
        </div>
        <div className="text-xs text-muted-foreground font-medium mt-0.5 line-clamp-1">
          {subtitle}
        </div>
      </div>
    </button>
  );
};
