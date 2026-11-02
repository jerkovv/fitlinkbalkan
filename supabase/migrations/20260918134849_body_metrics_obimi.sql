-- Već primenjeno na bazu preko MCP; ovaj fajl je samo za version control.
--
-- Merenja tela: pored tezine i masti, obimi (grudi, ruke, struk, gluteus, butine) i BMI.
-- Upisuju i vezbac i njegov trener; BMI racuna baza iz visine vezbaca.
ALTER TABLE public.body_metrics
  ADD COLUMN IF NOT EXISTS chest_cm numeric(5,1),
  ADD COLUMN IF NOT EXISTS arm_left_cm numeric(5,1),
  ADD COLUMN IF NOT EXISTS arm_right_cm numeric(5,1),
  ADD COLUMN IF NOT EXISTS waist_cm numeric(5,1),
  ADD COLUMN IF NOT EXISTS glutes_cm numeric(5,1),
  ADD COLUMN IF NOT EXISTS thigh_left_cm numeric(5,1),
  ADD COLUMN IF NOT EXISTS thigh_right_cm numeric(5,1),
  ADD COLUMN IF NOT EXISTS bmi numeric(4,1),
  ADD COLUMN IF NOT EXISTS entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.body_metrics ADD CONSTRAINT body_metrics_opsezi CHECK (
  (weight_kg IS NULL OR weight_kg BETWEEN 20 AND 400)
  AND (body_fat_pct IS NULL OR body_fat_pct BETWEEN 1 AND 75)
  AND (bmi IS NULL OR bmi BETWEEN 8 AND 90)
  AND (chest_cm IS NULL OR chest_cm BETWEEN 30 AND 250)
  AND (arm_left_cm IS NULL OR arm_left_cm BETWEEN 10 AND 90)
  AND (arm_right_cm IS NULL OR arm_right_cm BETWEEN 10 AND 90)
  AND (waist_cm IS NULL OR waist_cm BETWEEN 30 AND 250)
  AND (glutes_cm IS NULL OR glutes_cm BETWEEN 30 AND 250)
  AND (thigh_left_cm IS NULL OR thigh_left_cm BETWEEN 20 AND 150)
  AND (thigh_right_cm IS NULL OR thigh_right_cm BETWEEN 20 AND 150)
);

-- Ko je upisao (ne moze da se podmetne) i BMI iz visine kad je visina poznata;
-- bez visine ostaje BMI koji je upisan rucno.
CREATE OR REPLACE FUNCTION public._body_metrics_pre_upisa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visina numeric;
BEGIN
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL THEN
    NEW.entered_by := auth.uid();
  END IF;
  IF NEW.weight_kg IS NOT NULL THEN
    SELECT a.height_cm INTO v_visina FROM public.athletes a WHERE a.id = NEW.athlete_id;
    IF v_visina BETWEEN 100 AND 250 THEN
      NEW.bmi := round(NEW.weight_kg / ((v_visina / 100.0) ^ 2), 1);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._body_metrics_pre_upisa() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_body_metrics_pre_upisa ON public.body_metrics;
CREATE TRIGGER trg_body_metrics_pre_upisa
  BEFORE INSERT OR UPDATE ON public.body_metrics
  FOR EACH ROW EXECUTE FUNCTION public._body_metrics_pre_upisa();

-- Kad se visina upise ili promeni, BMI se preracuna za sva merenja tog vezbaca.
CREATE OR REPLACE FUNCTION public._athlete_visina_bmi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.height_cm IS DISTINCT FROM OLD.height_cm AND NEW.height_cm BETWEEN 100 AND 250 THEN
    UPDATE public.body_metrics
       SET bmi = round(weight_kg / ((NEW.height_cm / 100.0) ^ 2), 1)
     WHERE athlete_id = NEW.id AND weight_kg IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._athlete_visina_bmi() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_athlete_visina_bmi ON public.athletes;
CREATE TRIGGER trg_athlete_visina_bmi
  AFTER UPDATE OF height_cm ON public.athletes
  FOR EACH ROW EXECUTE FUNCTION public._athlete_visina_bmi();

-- Trener upisuje, menja i brise merenja svojih vezbaca (citanje je vec postojalo).
CREATE POLICY "trainer inserts athlete metrics" ON public.body_metrics
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = body_metrics.athlete_id AND a.trainer_id = auth.uid()));
CREATE POLICY "trainer updates athlete metrics" ON public.body_metrics
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = body_metrics.athlete_id AND a.trainer_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = body_metrics.athlete_id AND a.trainer_id = auth.uid()));
CREATE POLICY "trainer deletes athlete metrics" ON public.body_metrics
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = body_metrics.athlete_id AND a.trainer_id = auth.uid()));

-- Ista brana kao na ostalim trenerskim upisima: bez aktivne FitLink pretplate nema izmena.
CREATE POLICY pretplata_gate_ins ON public.body_metrics AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.can_trainer_write());
CREATE POLICY pretplata_gate_upd ON public.body_metrics AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.can_trainer_write()) WITH CHECK (public.can_trainer_write());
CREATE POLICY pretplata_gate_del ON public.body_metrics AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.can_trainer_write());
