import { useState } from "react";
import { PlayCircle, ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExerciseHeaderProps {
  name: string;
  primaryMuscle?: string | null;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  instructions?: string | null;
}

export const ExerciseHeader = ({
  name,
  primaryMuscle,
  thumbnailUrl,
  videoUrl,
  instructions,
}: ExerciseHeaderProps) => {
  const [videoOpen, setVideoOpen] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => videoUrl && setVideoOpen(true)}
        className={cn(
          "relative w-full aspect-[16/10] rounded-3xl overflow-hidden bg-surface-2 border border-hairline group",
          !videoUrl && "cursor-default"
        )}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-brand-soft flex items-center justify-center">
            <span className="font-display text-[40px] font-bold text-primary/40 tracking-tightest">
              {name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {videoUrl && (
          <>
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-16 w-16 rounded-full bg-white/95 text-foreground flex items-center justify-center shadow-xl group-active:scale-95 transition">
                <PlayCircle className="h-8 w-8" strokeWidth={2} />
              </div>
            </div>
          </>
        )}
      </button>

      <div className="space-y-1.5">
        <h2 className="font-display text-[28px] leading-[1.05] font-bold tracking-tightest text-foreground">
          {name}
        </h2>
        {primaryMuscle && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary-soft text-primary text-[11px] font-semibold uppercase tracking-[0.12em]">
            {primaryMuscle}
          </span>
        )}
      </div>

      {instructions && (
        <div>
          <button
            type="button"
            onClick={() => setInstructionsOpen((o) => !o)}
            className="text-[12px] font-semibold text-muted-foreground inline-flex items-center gap-1"
          >
            {instructionsOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            Uputstvo
          </button>
          {instructionsOpen && (
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground whitespace-pre-line">
              {instructions}
            </p>
          )}
        </div>
      )}

      {videoOpen && videoUrl && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col">
          <button
            type="button"
            onClick={() => setVideoOpen(false)}
            aria-label="Zatvori"
            className="absolute top-6 right-6 z-10 h-10 w-10 rounded-full bg-white/15 backdrop-blur text-white flex items-center justify-center"
          >
            <X className="h-5 w-5" />
          </button>
          <video
            src={videoUrl}
            controls
            autoPlay
            playsInline
            className="w-full h-full object-contain bg-black"
          />
        </div>
      )}
    </div>
  );
};

export default ExerciseHeader;
