import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Bookmark, Check, X } from "lucide-react";
import { toast } from "sonner";
import { MediaReportButton } from "@/components/workout/MediaReportButton";
import { porukaGreske } from "@/lib/errorMessage";
import { supabase } from "@/lib/supabase";
import { toEmbedUrl } from "@/lib/videoEmbed";
import { isImageUrl } from "@/lib/exerciseMedia";
import { exerciseVideoSrc, warmVideo } from "@/lib/videoWarmup";
import { MUSCLE_LABELS } from "@/lib/muscleGroups";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { cn } from "@/lib/utils";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { ZakljucanSnimak } from "./ZakljucanSnimak";
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

/**
 * Snimak krece odmah: pregled ubaci <video> koji je poceo da se ucitava jos kad je
 * mis stigao na dugme (ili prst dodirnuo) - vidi videoWarmup - pa je bafer vec pun.
 * Nema slicice pa videa: taj prelaz je izgledao kao trzaj.
 *
 * poster (telefon): slicica popuni okvir samo dok ne stigne prvi frejm, kao ranije.
 */
const PregledMedija = ({ exercise, poster }: { exercise: PickerExercise; poster: boolean }) => {
  const { locked } = usePretplataLock();
  const [videoFailed, setVideoFailed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const url = exercise.video_url;
  const videoSrc = exerciseVideoSrc(url);
  const embed = url && !videoSrc && !isImageUrl(url) ? toEmbedUrl(url) : null;
  const spoljni = embed?.type === "youtube" || embed?.type === "vimeo";
  // Bez pretplate snimak se ni ne ucitava.
  const zakljucan = locked && (!!videoSrc || spoljni);
  const useVideo = !!videoSrc && !videoFailed && !zakljucan;
  const useEmbed = spoljni && !zakljucan;
  // Slika: vezba bez snimka, ili snimak koji nije ucitao (nikad prazan prozor).
  const imageSrc = url && isImageUrl(url) ? url : exercise.thumbnail_url;

  useEffect(() => {
    if (!useVideo || !videoSrc) return;
    const box = boxRef.current;
    if (!box) return;
    const v = warmVideo(videoSrc);
    if (v.error) {
      setVideoFailed(true);
      return;
    }
    v.className = "absolute inset-0 h-full w-full object-contain";
    if (poster && exercise.thumbnail_url && v.readyState < 2) v.poster = exercise.thumbnail_url;
    // muted imperativno: React muted prop nije pouzdan, pa bi iOS blokirao autoplay.
    v.muted = true;
    v.defaultMuted = true;
    // Ponovno otvaranje iste vezbe krece od pocetka petlje.
    if (v.readyState >= 1) v.currentTime = 0;
    const tryPlay = () => { v.play().catch(() => {}); };
    const onError = () => setVideoFailed(true);
    // Browser pauzira nemi video kad se tab sakrije i ne nastavi sam - povratak na
    // tab bi zatekao zamrznut snimak (isto resava ExerciseHeader).
    const onVisible = () => {
      if (document.visibilityState === "visible") tryPlay();
    };
    v.addEventListener("canplay", tryPlay);
    v.addEventListener("error", onError);
    document.addEventListener("visibilitychange", onVisible);
    box.appendChild(v);
    tryPlay();
    return () => {
      v.removeEventListener("canplay", tryPlay);
      v.removeEventListener("error", onError);
      document.removeEventListener("visibilitychange", onVisible);
      v.pause();
      v.remove();
    };
  }, [useVideo, videoSrc, poster, exercise.thumbnail_url]);

  return (
    // 16:9 = format snimka (960x540), pa video ispunjava okvir bez traka.
    // Video element ubacuje efekat iznad (ne React), zato ovde nema <video>.
    <div ref={boxRef} className="relative w-full aspect-video bg-white">
      {zakljucan ? (
        <ZakljucanSnimak slika={exercise.thumbnail_url} naziv={exercise.name} />
      ) : useVideo ? null : useEmbed ? (
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
          className="absolute inset-0 h-full w-full object-contain"
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

  // Racunar, kao VezbaDetaljView na telefonu: opis, uputstvo i pomocni misici stizu
  // tek na otvaranje, jer ih spisak vezbi ne ucitava. Do odgovora tih delova nema.
  const otvorenaId = desktop ? exercise?.id ?? null : null;
  const [detalji, setDetalji] = useState<{
    id: string;
    description: string | null;
    instructions: string | null;
    secondary_muscles: string[] | null;
  } | null>(null);
  useEffect(() => {
    if (!otvorenaId) return;
    let ziv = true;
    (async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("id, description, instructions, secondary_muscles")
        .eq("id", otvorenaId)
        .maybeSingle();
      if (!ziv) return;
      if (error) {
        toast.error(porukaGreske(error));
        return;
      }
      setDetalji((data as typeof detalji) ?? null);
    })();
    return () => {
      ziv = false;
    };
  }, [otvorenaId]);
  const d = desktop && ex && detalji?.id === ex.id ? detalji : null;
  const pomocni = (d?.secondary_muscles ?? []).slice(0, 4);
  const opis = d?.description?.trim();
  const uputstvo = d?.instructions?.trim();

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
                <DialogPrimitive.Description className="sr-only">Pregled vežbe</DialogPrimitive.Description>

                <div className="relative shrink-0">
                  {/* key po vezbi: nova vezba = cist video element i resetovani fallback-ovi */}
                  <PregledMedija key={ex.id} exercise={ex} poster={!desktop} />
                  <DialogPrimitive.Close
                    aria-label="Zatvori"
                    className="absolute right-3 top-3 h-9 w-9 rounded-full bg-background/85 backdrop-blur-md shadow-sm flex items-center justify-center hover:bg-background transition"
                  >
                    <X size={18} />
                  </DialogPrimitive.Close>
                  {/* z-[120]: prozor prijave mora iznad ovog pregleda (z-110). */}
                  {desktop && (ex.video_url || ex.thumbnail_url) && (
                    <MediaReportButton exerciseId={ex.id} slojClassName="z-[120]" />
                  )}
                </div>

                <div className="min-h-0 overflow-y-auto px-5 pt-4 pb-1 border-t border-hairline">
                  <h3 className="font-display text-[22px] leading-tight font-bold tracking-tighter">{ex.name}</h3>
                  {engleski && <p className="mt-0.5 text-sm text-muted-foreground">{engleski}</p>}
                  {grupa && (
                    <span className="mt-2.5 inline-flex rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                      {grupa}
                    </span>
                  )}
                  {pomocni.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11.5px] text-muted-foreground">Pomoćni:</span>
                      {pomocni.map((m) => (
                        <span key={m} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground">
                          {MUSCLE_LABELS[m] ?? m}
                        </span>
                      ))}
                    </div>
                  )}
                  {opis && (
                    <section className="mt-4">
                      <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Opis</h4>
                      <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed">{opis}</p>
                    </section>
                  )}
                  {uputstvo && (
                    <section className="mt-4">
                      <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Kako se radi</h4>
                      <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed">{uputstvo}</p>
                    </section>
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
