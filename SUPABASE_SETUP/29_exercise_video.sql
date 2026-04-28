-- =====================================================================
-- 29_exercise_video.sql
-- Dodaje video_url polje za demo video (YouTube/Vimeo/direktan link)
-- =====================================================================

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS video_url text;

-- Sanity provera (samo http/https)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exercises_video_url_format') THEN
    ALTER TABLE public.exercises
      ADD CONSTRAINT exercises_video_url_format
      CHECK (video_url IS NULL OR video_url ~ '^https?://');
  END IF;
END$$;
