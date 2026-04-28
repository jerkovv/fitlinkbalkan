-- =====================================================================
-- 30_chat_messages.sql
-- 1) messages tabela: 1-na-1 trener ↔ vežbač
-- 2) RLS: učesnici vide / pišu samo u svoj thread
-- 3) Realtime publication
-- 4) RPC: get_chat_threads (lista za trenera) + mark_thread_read
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabela
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz,
  CONSTRAINT messages_sender_is_participant
    CHECK (sender_id = trainer_id OR sender_id = athlete_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_thread
  ON public.messages (trainer_id, athlete_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_athlete
  ON public.messages (athlete_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON public.messages (trainer_id, athlete_id) WHERE read_at IS NULL;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 2) RLS
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "participants read"   ON public.messages;
DROP POLICY IF EXISTS "participants insert" ON public.messages;
DROP POLICY IF EXISTS "participants mark read" ON public.messages;

-- Read: učesnik (trener ili vežbač u toj relaciji) + relacija postoji u athletes
CREATE POLICY "participants read"
  ON public.messages FOR SELECT
  USING (
    auth.uid() IN (trainer_id, athlete_id)
    AND EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.id = messages.athlete_id
        AND a.trainer_id = messages.trainer_id
    )
  );

-- Insert: sender mora biti auth.uid() i učesnik; relacija mora postojati
CREATE POLICY "participants insert"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND auth.uid() IN (trainer_id, athlete_id)
    AND EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.id = messages.athlete_id
        AND a.trainer_id = messages.trainer_id
    )
  );

-- Update: samo primalac može da označi kao pročitano (postavi read_at)
CREATE POLICY "participants mark read"
  ON public.messages FOR UPDATE
  USING (
    auth.uid() IN (trainer_id, athlete_id)
    AND auth.uid() <> sender_id
  )
  WITH CHECK (
    auth.uid() IN (trainer_id, athlete_id)
    AND auth.uid() <> sender_id
  );

-- ---------------------------------------------------------------------
-- 3) Realtime
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;
END$$;

ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------
-- 4) RPC: lista threadova za trenera (poslednja poruka + unread count)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_chat_threads()
RETURNS TABLE (
  athlete_id     uuid,
  athlete_name   text,
  last_body      text,
  last_at        timestamptz,
  last_sender_id uuid,
  unread_count   int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_athletes AS (
    SELECT a.id AS athlete_id
    FROM public.athletes a
    WHERE a.trainer_id = auth.uid()
  ),
  last_msg AS (
    SELECT DISTINCT ON (m.athlete_id)
      m.athlete_id, m.body, m.created_at, m.sender_id
    FROM public.messages m
    WHERE m.trainer_id = auth.uid()
    ORDER BY m.athlete_id, m.created_at DESC
  ),
  unread AS (
    SELECT m.athlete_id, count(*)::int AS cnt
    FROM public.messages m
    WHERE m.trainer_id = auth.uid()
      AND m.sender_id = m.athlete_id
      AND m.read_at IS NULL
    GROUP BY m.athlete_id
  )
  SELECT
    ma.athlete_id,
    coalesce(p.full_name, 'Vežbač') AS athlete_name,
    lm.body                          AS last_body,
    lm.created_at                    AS last_at,
    lm.sender_id                     AS last_sender_id,
    coalesce(u.cnt, 0)               AS unread_count
  FROM my_athletes ma
  LEFT JOIN last_msg lm ON lm.athlete_id = ma.athlete_id
  LEFT JOIN unread   u  ON u.athlete_id  = ma.athlete_id
  LEFT JOIN public.profiles p ON p.id = ma.athlete_id
  ORDER BY lm.created_at DESC NULLS LAST, p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_chat_threads() TO authenticated;

-- ---------------------------------------------------------------------
-- 5) RPC: označi sve poruke u threadu kao pročitane
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_thread_read(p_athlete_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  -- Pozivalac je ili trener (čita poruke od atlete) ili sam atleta (čita od trenera)
  UPDATE public.messages m
     SET read_at = now()
   WHERE m.athlete_id = p_athlete_id
     AND m.read_at IS NULL
     AND m.sender_id <> auth.uid()
     AND auth.uid() IN (m.trainer_id, m.athlete_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_thread_read(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 6) RPC: ukupan broj nepročitanih (za bell badge)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_unread_chat_count()
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.messages m
  WHERE m.read_at IS NULL
    AND m.sender_id <> auth.uid()
    AND auth.uid() IN (m.trainer_id, m.athlete_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_chat_count() TO authenticated;
