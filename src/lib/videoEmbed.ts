/**
 * Konvertuje YouTube/Vimeo URL u embed formu, ili vraća original (npr. .mp4 link).
 */
export function toEmbedUrl(url: string): { type: "youtube" | "vimeo" | "video" | "iframe"; src: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    // YouTube
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return { type: "youtube", src: `https://www.youtube.com/embed/${v}?rel=0` };
      // shorts
      const shortsMatch = u.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shortsMatch) return { type: "youtube", src: `https://www.youtube.com/embed/${shortsMatch[1]}?rel=0` };
    }
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "");
      if (id) return { type: "youtube", src: `https://www.youtube.com/embed/${id}?rel=0` };
    }

    // Vimeo
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id) return { type: "vimeo", src: `https://player.vimeo.com/video/${id}` };
    }

    // Direktan video
    if (/\.(mp4|webm|ogg|mov)$/i.test(u.pathname)) {
      return { type: "video", src: url };
    }

    // Fallback iframe (rizično, ali pokuša)
    return { type: "iframe", src: url };
  } catch {
    return null;
  }
}
