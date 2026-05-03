import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ExerciseHeaderProps {
  name: string;
  primaryMuscle?: string | null;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  instructions?: string | null;
}

const isVideo = (url: string) => /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
const isImage = (url: string) => /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url);

export const ExerciseHeader = ({
  name,
  primaryMuscle,
  thumbnailUrl,
  videoUrl,
  instructions,
}: ExerciseHeaderProps) => {
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const media = videoUrl || thumbnailUrl || null;

  return (
    <div className="space-y-3">
      <div className="relative w-full aspect-[16/10] rounded-3xl overflow-hidden bg-surface-2 border border-hairline">
        {media && isVideo(media) ? (
          <video
            src={media}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : media && (isImage(media) || media === thumbnailUrl) ? (
          <img
            src={media}
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
      </div>

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
    </div>
  );
};

export default ExerciseHeader;
