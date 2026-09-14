import { toEmbedUrl } from "@/lib/videoEmbed";
import { isImageUrl } from "@/lib/exerciseMedia";

// Snimci vezbi koji su poceli da se ucitavaju pre otvaranja pregleda. Kad mis stigne
// na dugme za pregled (ili prst dodirne dugme), pravi se <video> i krece ucitavanje;
// pregled zatim ubaci BAS taj element, sa vec napunjenim baferom, pa snimak krene
// odmah umesto da se ceka mreza. Premestanje elementa u DOM ne brise bafer.
const MAX = 6;
const cache = new Map<string, HTMLVideoElement>();

function napravi(src: string): HTMLVideoElement {
  const v = document.createElement("video");
  v.muted = true;
  v.defaultMuted = true;
  v.loop = true;
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("muted", "");
  v.preload = "auto";
  v.src = src;
  v.load();
  return v;
}

/** Vrati (ili napravi i pocni da ucitava) video element za dati direktan link. */
export function warmVideo(src: string): HTMLVideoElement {
  const postojeci = cache.get(src);
  if (postojeci && !postojeci.error) {
    // Osvezi redosled (Map cuva redosled ubacivanja = najstariji prvi).
    cache.delete(src);
    cache.set(src, postojeci);
    return postojeci;
  }
  const v = napravi(src);
  cache.delete(src);
  cache.set(src, v);
  // Izbaci najstarije koji trenutno nisu na ekranu.
  for (const [kljuc, el] of cache) {
    if (cache.size <= MAX) break;
    if (el.isConnected) continue;
    el.removeAttribute("src");
    el.load();
    cache.delete(kljuc);
  }
  return v;
}

/** Link snimka vezbe -> src za <video>, ili null kad nije direktan snimak (slika, YouTube...). */
export function exerciseVideoSrc(url: string | null | undefined): string | null {
  if (!url || isImageUrl(url)) return null;
  const embed = toEmbedUrl(url);
  return embed?.type === "video" ? embed.src : null;
}

/** Pocni ucitavanje snimka vezbe unapred (bez efekta za slike i YouTube/Vimeo). */
export function warmExerciseVideo(url: string | null | undefined): void {
  const src = exerciseVideoSrc(url);
  if (src) warmVideo(src);
}
