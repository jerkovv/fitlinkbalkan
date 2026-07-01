import { useEffect, useRef, useState } from "react";
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

  const [videoFailed, setVideoFailed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const media = videoUrl || thumbnailUrl || null;
  const embed = videoUrl ? toEmbedUrl(videoUrl) : null;
  const isDirectImage = media ? isImage(media) : false;

  const useVideo = !!embed && embed.type === "video" && !videoFailed;
  const useEmbed = !!embed && (embed.type === "youtube" || embed.type === "vimeo");
  // Slika: direktan image link (gif/webp/png/jpg - sam se vrti) ili thumbnail. Sluzi i kao
  // fallback ako video ne ucita (onError) -> nikad mrtvo play dugme.
  const imageSrc = isDirectImage ? media : thumbnailUrl || null;
  const useImage = !useVideo && !useEmbed && !!imageSrc && !imgFailed;

  // Nova vezba (izvor se promeni) -> resetuj failure flag-ove.
  useEffect(() => {
    setVideoFailed(false);
    setImgFailed(false);
  }, [videoUrl, thumbnailUrl]);

  // React `muted` prop nije pouzdan (autoplay se blokira -> iOS prikaze play dugme). Postavi
  // muted imperativno i probaj play na mount / promeni izvora, da media UVEK krene sama.
  useEffect(() => {
    if (!useVideo) return;
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    const tryPlay = () => { v.play().catch(() => {}); };
    tryPlay();
    v.addEventListener("canplay", tryPlay);
    v.addEventListener("loadeddata", tryPlay);
    return () => {
      v.removeEventListener("canplay", tryPlay);
      v.removeEventListener("loadeddata", tryPlay);
    };
  }, [useVideo, embed?.src]);

  return (
    <div className="space-y-3">
      <div className="relative w-full aspect-[16/10] rounded-3xl overflow-hidden bg-surface-2 border border-hairline">
        {useVideo ? (
          <video
            ref={videoRef}
            src={embed!.src}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            controls={false}
            onError={() => setVideoFailed(true)}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        ) : useEmbed ? (
          <iframe
            src={buildLoopEmbed(embed!)}
            title={name}
            allow="autoplay; encrypted-media; picture-in-picture"
            className="absolute inset-0 w-full h-full pointer-events-none"
            frameBorder={0}
          />
        ) : useImage ? (
          <img
            src={imageSrc!}
            alt={name}
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
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
