import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toEmbedUrl } from "@/lib/videoEmbed";

interface ExerciseHeaderProps {
  name: string;
  nameEn?: string | null;
  primaryMuscle?: string | null;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  instructions?: string | null;
}

const isImage = (url: string) => /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url);

const buildLoopEmbed = (
  embed: { type: "youtube" | "vimeo" | "video" | "iframe"; src: string },
): string => {
  try {
    const u = new URL(embed.src);
    if (embed.type === "youtube") {
      const id = u.pathname.split("/").pop();
      u.searchParams.set("autoplay", "1");
      u.searchParams.set("mute", "1");
      u.searchParams.set("loop", "1");
      u.searchParams.set("controls", "0");
      u.searchParams.set("modestbranding", "1");
      u.searchParams.set("playsinline", "1");
      u.searchParams.set("rel", "0");
      u.searchParams.set("showinfo", "0");
      if (id) u.searchParams.set("playlist", id);
      return u.toString();
    }
    if (embed.type === "vimeo") {
      u.searchParams.set("autoplay", "1");
      u.searchParams.set("muted", "1");
      u.searchParams.set("loop", "1");
      u.searchParams.set("background", "1");
      u.searchParams.set("controls", "0");
      return u.toString();
    }
    return embed.src;
  } catch {
    return embed.src;
  }
};

export const ExerciseHeader = ({
  name,
  nameEn,
  primaryMuscle,
  thumbnailUrl,
  videoUrl,
  instructions,
}: ExerciseHeaderProps) => {
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const primary = nameEn?.trim() || name;
  const showSecondary = !!(nameEn && nameEn.trim() && name && nameEn.trim() !== name);

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

      <div className="space-y-1">
        <h2 className="font-display text-[28px] leading-[1.05] font-bold tracking-tightest text-foreground">
          {primary}
        </h2>
        {showSecondary && (
          <p className="text-[14px] text-muted-foreground">{name}</p>
        )}
        {primaryMuscle && (
          <div className="pt-1.5">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary-soft text-primary text-[11px] font-semibold uppercase tracking-[0.12em]">
              {primaryMuscle}
            </span>
          </div>
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
