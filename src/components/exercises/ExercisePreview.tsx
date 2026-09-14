import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Bookmark, Check, X } from "lucide-react";
import { toEmbedUrl } from "@/lib/videoEmbed";
import { isImageUrl } from "@/lib/exerciseMedia";
import { MUSCLE_LABELS } from "@/lib/muscleGroups";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { cn } from "@/lib/utils";
import type { PickerExercise } from "./ExerciseCard";

type Props = {
  /** Vezba za pregled; null = zatvoreno. */
  exercise: PickerExercise | null;
  onClose: () => void;
  selected: boolean;
  bookmarked: boolean;
  onToggleSelect: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  /** Zamena vezbe (1:1) - drugi natpis na dugmetu za izbor. */
  replaceMode?: boolean;
};

const PregledMedija = ({ exercise }: { exercise: PickerExercise }) => {
  const [videoFailed, setVideoFailed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const url = exercise.video_url;
  const embed = url && !isImageUrl(url) ? toEmbedUrl(url) : null;
  const useVideo = embed?.type === "video" && !videoFailed;
  const useEmbed = embed?.type === "youtube" || embed?.type === "vimeo";
  // Slika: vezba bez snimka, ili snimak koji nije ucitao (nikad prazan prozor).
  const imageSrc = url && isImageUrl(url) ? url : exercise.thumbnail_url;

  // muted imperativno + play na canplay: React muted prop nije pouzdan, pa bi iOS
  // blokirao autoplay i prikazao svoje play dugme (isto kao ExerciseHeader).
  useEffect(() => {
    if (!useVideo) return;
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    const tryPlay = () => { v.play().catch(() => {}); };
    tryPlay();
    v.addEventListener("canplay", tryPlay);
    return () => v.removeEventListener("canplay", tryPlay);
  }, [useVideo, embed?.src]);

  return (
    <div className="relative w-full aspect-[4/3] bg-white">
      {useVideo ? (
        <video
          ref={videoRef}
          src={embed!.src}
          poster={exercise.thumbnail_url ?? undefined}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onError={() => setVideoFailed(true)}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : useEmbed ? (
        <iframe
          src={embed!.src}
          title={exercise.name}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
          frameBorder={0}
        />
      ) : imageSrc && !imgFailed ? (
        <img
          src={imageSrc}
          alt={exercise.name}
          onError={() => setImgFailed(true)}
          className="absolute inset-0 h-full w-full object-contain p-2"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-brand-soft flex items-center justify-center">
          <span className="font-display text-5xl font-bold text-primary/40">
            {exercise.name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
};

/**
 * Pregled vezbe iz birača: snimak u petlji, naziv i grupa, pa "Sačuvaj" i "Izaberi"
 * odmah odatle. Na kartici se vidi samo slicica, a treneru pre dodavanja treba
 * pokret - slicnih vezbi (varijante potiska i sl.) ima mnogo.
 *
 * Telefon: fioka odozdo. Racunar: prozor na sredini. z-[110] je iznad full-screen
 * sloja (z-100), jer se pregled otvara i iz pretrage na telefonu.
 */
export const ExercisePreview = ({
  exercise,
  onClose,
  selected,
  bookmarked,
  onToggleSelect,
  onToggleBookmark,
  replaceMode,
}: Props) => {
  const desktop = useDesktopWeb();
  // Poslednja vezba ostaje u prozoru dok traje animacija zatvaranja - inace bi se
  // prozor ispraznio pre nego sto nestane.
  const [poslednja, setPoslednja] = useState(exercise);
  useEffect(() => {
    if (exercise) setPoslednja(exercise);
  }, [exercise]);
  const ex = exercise ?? poslednja;

  const engleski =
    ex?.name_en?.trim() && ex.name_en.trim().toLowerCase() !== ex.name.trim().toLowerCase()
      ? ex.name_en.trim()
      : null;
  const grupa = ex ? MUSCLE_LABELS[ex.primary_muscle] ?? ex.primary_muscle : null;

  return (
    <DialogPrimitive.Root open={!!exercise} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        {/* Omotac centrira flex-om (ne transform-om, da ga animacija ne pomeri). */}
        <div
          className={cn(
            "fixed inset-0 z-[110] flex justify-center pointer-events-none",
            desktop ? "items-center p-6" : "items-end",
          )}
        >
          <DialogPrimitive.Content
            // Bez automatskog fokusa: na telefonu bi fokus na dugmetu samo nacrtao okvir.
            onOpenAutoFocus={(e) => e.preventDefault()}
            className={cn(
              "relative pointer-events-auto flex w-full flex-col overflow-hidden bg-background shadow-2xl focus:outline-none",
              desktop
                ? "max-w-[640px] max-h-[calc(100dvh-48px)] rounded-2xl border border-hairline duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
                : "max-w-[440px] max-h-[92dvh] rounded-t-3xl duration-300 data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom",
            )}
          >
            {ex && (
              <>
                <DialogPrimitive.Title className="sr-only">{ex.name}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">Snimak i podaci o vežbi</DialogPrimitive.Description>

                <div className="relative shrink-0">
                  {/* key po vezbi: nova vezba = cist video element i resetovani fallback-ovi */}
                  <PregledMedija key={ex.id} exercise={ex} />
                  <DialogPrimitive.Close
                    aria-label="Zatvori"
                    className="absolute right-3 top-3 h-9 w-9 rounded-full bg-background/85 backdrop-blur-md shadow-sm flex items-center justify-center hover:bg-background transition"
                  >
                    <X size={18} />
                  </DialogPrimitive.Close>
                </div>

                <div className="min-h-0 overflow-y-auto px-5 pt-4 pb-1 border-t border-hairline">
                  <h3 className="font-display text-[22px] leading-tight font-bold tracking-tighter">{ex.name}</h3>
                  {engleski && <p className="mt-0.5 text-sm text-muted-foreground">{engleski}</p>}
                  {grupa && (
                    <span className="mt-2.5 inline-flex rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                      {grupa}
                    </span>
                  )}
                </div>

                <div
                  className={cn(
                    "shrink-0 flex items-center gap-2 px-5 pt-4",
                    desktop ? "pb-5" : "pb-[max(env(safe-area-inset-bottom),20px)]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onToggleBookmark(ex.id)}
                    aria-pressed={bookmarked}
                    className={cn(
                      "h-11 shrink-0 rounded-full border px-4 flex items-center gap-2 text-sm font-semibold transition",
                      bookmarked
                        ? "border-primary/40 bg-primary-soft text-primary"
                        : "border-hairline hover:bg-surface-2",
                    )}
                  >
                    <Bookmark size={16} fill={bookmarked ? "currentColor" : "none"} />
                    {bookmarked ? "Sačuvano" : "Sačuvaj"}
                  </button>
                  {/* Izbor zatvara pregled - trener se vraca na listu da bira dalje. */}
                  <button
                    type="button"
                    onClick={() => {
                      onToggleSelect(ex.id);
                      onClose();
                    }}
                    className={cn(
                      "h-11 flex-1 rounded-full px-5 flex items-center justify-center gap-2 text-sm font-semibold transition active:scale-[0.98]",
                      selected
                        ? "bg-surface-2 text-foreground hover:bg-surface-3"
                        : "bg-gradient-brand text-primary-foreground shadow-brand",
                    )}
                  >
                    {selected ? (
                      "Ukloni iz izbora"
                    ) : (
                      <>
                        <Check size={16} strokeWidth={3} />
                        {replaceMode ? "Izaberi ovu vežbu" : "Izaberi vežbu"}
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
