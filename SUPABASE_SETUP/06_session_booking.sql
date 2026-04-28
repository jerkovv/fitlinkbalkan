-- ============================================================
-- 06_session_booking.sql
-- Termini, nedeljni šablon, override-i i rezervacije
-- ============================================================

-- ============================================================
-- 1) Tipovi sesija (npr. Personalni, Group HIIT, Yoga)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.session_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  color         text NOT NULL DEFAULT 'violet', -- violet|indigo|emerald|amber|rose|sky
  capacity      int  NOT NULL DEFAULT 1,
  duration_min  int  NOT NULL DEFAULT 60,
  is_archived   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_st_trainer ON public.session_types(trainer_id);

ALTER TABLE public.session_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trainer rw own session types" ON public.session_types;
CREATE POLICY "trainer rw own session types"
  ON public.session_types FOR ALL
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid());

DROP POLICY IF EXISTS "athlete reads trainer session types" ON public.session_types;
CREATE POLICY "athlete reads trainer session types"
  ON public.session_types FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.trainer_id = session_types.trainer_id
        AND a.id = auth.uid()
    )
  );

-- ============================================================
-- 2) Nedeljni šablon (weekday: 0=Pon..6=Ned)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.session_slot_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type_id uuid NOT NULL REFERENCES public.session_types(id) ON DELETE CASCADE,
  weekday         int  NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time      time NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trainer_id, weekday, start_time, session_type_id)
);

CREATE INDEX IF NOT EXISTS idx_sst_trainer ON public.session_slot_templates(trainer_id, weekday);

ALTER TABLE public.session_slot_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trainer rw own templates" ON public.session_slot_templates;
CREATE POLICY "trainer rw own templates"
  ON public.session_slot_templates FOR ALL
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid());

DROP POLICY IF EXISTS "athlete reads trainer templates" ON public.session_slot_templates;
CREATE POLICY "athlete reads trainer templates"
  ON public.session_slot_templates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.trainer_id = session_slot_templates.trainer_id
        AND a.id = auth.uid()
    )
  );

-- ============================================================
-- 3) Per-day override (otkazi specifičan slot ili dodaj ad-hoc)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.session_slot_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date            date NOT NULL,
  -- Ako je template_id NULL → ad-hoc dodatni slot za taj dan
  template_id     uuid REFERENCES public.session_slot_templates(id) ON DELETE CASCADE,
  -- Polja za ad-hoc / nadjačavanje:
  session_type_id uuid REFERENCES public.session_types(id) ON DELETE CASCADE,
  start_time      time,
  is_canceled     boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sso_trainer_date ON public.session_slot_overrides(trainer_id, date);

ALTER TABLE public.session_slot_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trainer rw own overrides" ON public.session_slot_overrides;
CREATE POLICY "trainer rw own overrides"
  ON public.session_slot_overrides FOR ALL
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid());

DROP POLICY IF EXISTS "athlete reads trainer overrides" ON public.session_slot_overrides;
CREATE POLICY "athlete reads trainer overrides"
  ON public.session_slot_overrides FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.trainer_id = session_slot_overrides.trainer_id
        AND a.id = auth.uid()
    )
  );

-- ============================================================
-- 4) Rezervacije
-- ============================================================
CREATE TABLE IF NOT EXISTS public.session_bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date            date NOT NULL,
  start_time      time NOT NULL,
  session_type_id uuid NOT NULL REFERENCES public.session_types(id) ON DELETE CASCADE,
  -- Snapshot (radi istorije ako se template obriše)
  type_name       text NOT NULL,
  type_color      text NOT NULL,
  duration_min    int  NOT NULL,
  capacity        int  NOT NULL,
  status          text NOT NULL DEFAULT 'booked', -- booked|canceled|attended|no_show
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, date, start_time, session_type_id)
);

CREATE INDEX IF NOT EXISTS idx_sb_trainer_date ON public.session_bookings(trainer_id, date);
CREATE INDEX IF NOT EXISTS idx_sb_athlete_date ON public.session_bookings(athlete_id, date);
CREATE INDEX IF NOT EXISTS idx_sb_slot ON public.session_bookings(trainer_id, date, start_time, session_type_id);

ALTER TABLE public.session_bookings ENABLE ROW LEVEL SECURITY;

-- Trener: pun pristup
DROP POLICY IF EXISTS "trainer rw bookings" ON public.session_bookings;
CREATE POLICY "trainer rw bookings"
  ON public.session_bookings FOR ALL
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid());

-- Vežbač: čita svoje, briše svoje (cancel)
DROP POLICY IF EXISTS "athlete reads own bookings" ON public.session_bookings;
CREATE POLICY "athlete reads own bookings"
  ON public.session_bookings FOR SELECT
  USING (athlete_id = auth.uid());

DROP POLICY IF EXISTS "athlete cancels own bookings" ON public.session_bookings;
CREATE POLICY "athlete cancels own bookings"
  ON public.session_bookings FOR DELETE
  USING (athlete_id = auth.uid());

-- Vežbač vidi rezervacije drugih vežbača istog trenera (samo broj zauzetih mesta)
DROP POLICY IF EXISTS "athlete reads sibling bookings" ON public.session_bookings;
CREATE POLICY "athlete reads sibling bookings"
  ON public.session_bookings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.id = auth.uid()
        AND a.trainer_id = session_bookings.trainer_id
    )
  );

-- ============================================================
-- 5) RPC: get_day_slots — materijalizuj slotove za dati dan
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_day_slots(
  p_trainer_id uuid,
  p_date date
)
RETURNS TABLE (
  session_type_id uuid,
  type_name text,
  type_color text,
  start_time time,
  duration_min int,
  capacity int,
  booked_count int,
  is_canceled boolean,
  template_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_weekday int;
BEGIN
  -- ISO: 1=Mon..7=Sun → konvertuj u 0..6 (Pon=0)
  v_weekday := (EXTRACT(ISODOW FROM p_date)::int) - 1;

  RETURN QUERY
  WITH base AS (
    -- Slotovi iz nedeljnog šablona
    SELECT
      st.id AS session_type_id,
      st.name AS type_name,
      st.color AS type_color,
      sst.start_time,
      st.duration_min,
      st.capacity,
      sst.id AS template_id,
      COALESCE(sso.is_canceled, false) AS is_canceled,
      sso.start_time AS override_start
    FROM session_slot_templates sst
    JOIN session_types st ON st.id = sst.session_type_id
    LEFT JOIN session_slot_overrides sso
      ON sso.template_id = sst.id AND sso.date = p_date
    WHERE sst.trainer_id = p_trainer_id
      AND sst.weekday = v_weekday
      AND sst.is_active = true
      AND st.is_archived = false

    UNION ALL

    -- Ad-hoc slotovi (override bez template_id)
    SELECT
      st.id,
      st.name,
      st.color,
      sso.start_time,
      st.duration_min,
      st.capacity,
      NULL::uuid,
      false,
      sso.start_time
    FROM session_slot_overrides sso
    JOIN session_types st ON st.id = sso.session_type_id
    WHERE sso.trainer_id = p_trainer_id
      AND sso.date = p_date
      AND sso.template_id IS NULL
      AND sso.is_canceled = false
      AND st.is_archived = false
  )
  SELECT
    b.session_type_id,
    b.type_name,
    b.type_color,
    COALESCE(b.override_start, b.start_time) AS start_time,
    b.duration_min,
    b.capacity,
    COALESCE((
      SELECT COUNT(*)::int FROM session_bookings sb
      WHERE sb.trainer_id = p_trainer_id
        AND sb.date = p_date
        AND sb.start_time = COALESCE(b.override_start, b.start_time)
        AND sb.session_type_id = b.session_type_id
        AND sb.status = 'booked'
    ), 0) AS booked_count,
    b.is_canceled,
    b.template_id
  FROM base b
  ORDER BY 4;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_day_slots(uuid, date) TO authenticated;

-- ============================================================
-- 6) RPC: book_session — vežbač rezerviše (provera kapaciteta + članarine)
-- ============================================================
CREATE OR REPLACE FUNCTION public.book_session(
  p_trainer_id uuid,
  p_date date,
  p_start_time time,
  p_session_type_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_athlete_id uuid := auth.uid();
  v_type session_types%ROWTYPE;
  v_booked int;
  v_has_membership boolean;
  v_booking_id uuid;
BEGIN
  IF v_athlete_id IS NULL THEN
    RAISE EXCEPTION 'Niste prijavljeni';
  END IF;

  -- Provera: vežbač je vezan za tog trenera
  IF NOT EXISTS (
    SELECT 1 FROM athletes
    WHERE id = v_athlete_id AND trainer_id = p_trainer_id
  ) THEN
    RAISE EXCEPTION 'Niste član ovog trenera';
  END IF;

  -- Provera: aktivna članarina (memberships tabela ako postoji)
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.athlete_id = v_athlete_id
      AND m.trainer_id = p_trainer_id
      AND m.status = 'active'
      AND (m.valid_until IS NULL OR m.valid_until >= p_date)
  ) INTO v_has_membership;

  IF NOT v_has_membership THEN
    RAISE EXCEPTION 'Nemate aktivnu članarinu kod ovog trenera';
  END IF;

  -- Učitaj tip
  SELECT * INTO v_type FROM session_types WHERE id = p_session_type_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tip sesije ne postoji';
  END IF;

  -- Provera kapaciteta
  SELECT COUNT(*) INTO v_booked
  FROM session_bookings
  WHERE trainer_id = p_trainer_id
    AND date = p_date
    AND start_time = p_start_time
    AND session_type_id = p_session_type_id
    AND status = 'booked';

  IF v_booked >= v_type.capacity THEN
    RAISE EXCEPTION 'Termin je pun';
  END IF;

  -- Insert
  INSERT INTO session_bookings (
    trainer_id, athlete_id, date, start_time, session_type_id,
    type_name, type_color, duration_min, capacity, status
  ) VALUES (
    p_trainer_id, v_athlete_id, p_date, p_start_time, p_session_type_id,
    v_type.name, v_type.color, v_type.duration_min, v_type.capacity, 'booked'
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_session(uuid, date, time, uuid) TO authenticated;
