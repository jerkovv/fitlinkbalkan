/** Direktan link na sliku. Deo vezbi u video_url nosi samo sliku, bez snimka. */
export const isImageUrl = (url: string) => /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url);

/** Vezba ima pravi snimak pokreta (mp4, YouTube, Vimeo), a ne sliku u video_url. */
export const hasExerciseVideo = (ex: { video_url: string | null }) =>
  !!ex.video_url && !isImageUrl(ex.video_url);
