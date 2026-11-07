-- Već primenjeno na bazu preko MCP; ovaj fajl je samo za version control.

-- Kofa exercise-videos: pisanje sme samo admin i trener, i to trener samo u svom prostoru.
-- Ranije su INSERT/UPDATE/DELETE proveravali samo bucket_id, pa je svaki prijavljen
-- korisnik (i vezbac) mogao da otpremi, prepise ili obrise tudji snimak.
--
-- Nijedan klijent (React, admin, iOS) danas ne otprema u ovu kofu - snimci vezbi su
-- linkovi u exercises.video_url. Pravila vaze za buduce otpremanje:
--   <trener_uid>/...    trenerov folder
--   <exercise_id>/...   snimak vezbe koju je trener sam napravio (created_by, nije globalna)
-- Admin (public.is_admin()) sme bilo gde u kofi. Trener pise samo dok mu vazi FitLink
-- pretplata (can_trainer_write), kao i za samu tabelu exercises. Vezbac ne pise.
-- Citanje ostaje javno ("Public read access for exercise videos" se ne dira).
--
-- U podupitu nad exercises kolona "name" je ime vezbe, zato putanja ide kao objects.name.

DROP POLICY IF EXISTS "Authenticated upload for exercise videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update for exercise videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete for exercise videos" ON storage.objects;

DROP POLICY IF EXISTS "exercise videos admin ili trener otprema" ON storage.objects;
CREATE POLICY "exercise videos admin ili trener otprema"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'exercise-videos'
    AND (
      public.is_admin()
      OR (
        public.has_role(auth.uid(), 'trainer'::public.app_role)
        AND public.can_trainer_write()
        AND (
          (storage.foldername(objects.name))[1] = auth.uid()::text
          OR EXISTS (
            SELECT 1 FROM public.exercises e
            WHERE e.id::text = (storage.foldername(objects.name))[1]
              AND e.created_by = auth.uid()
              AND e.is_global = false
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "exercise videos admin ili trener menja" ON storage.objects;
CREATE POLICY "exercise videos admin ili trener menja"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'exercise-videos'
    AND (
      public.is_admin()
      OR (
        public.has_role(auth.uid(), 'trainer'::public.app_role)
        AND public.can_trainer_write()
        AND (
          (storage.foldername(objects.name))[1] = auth.uid()::text
          OR EXISTS (
            SELECT 1 FROM public.exercises e
            WHERE e.id::text = (storage.foldername(objects.name))[1]
              AND e.created_by = auth.uid()
              AND e.is_global = false
          )
        )
      )
    )
  )
  -- Isti uslov i za novu putanju, da trener ne moze da premesti snimak u tudji folder.
  WITH CHECK (
    bucket_id = 'exercise-videos'
    AND (
      public.is_admin()
      OR (
        public.has_role(auth.uid(), 'trainer'::public.app_role)
        AND public.can_trainer_write()
        AND (
          (storage.foldername(objects.name))[1] = auth.uid()::text
          OR EXISTS (
            SELECT 1 FROM public.exercises e
            WHERE e.id::text = (storage.foldername(objects.name))[1]
              AND e.created_by = auth.uid()
              AND e.is_global = false
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "exercise videos admin ili trener brise" ON storage.objects;
CREATE POLICY "exercise videos admin ili trener brise"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'exercise-videos'
    AND (
      public.is_admin()
      OR (
        public.has_role(auth.uid(), 'trainer'::public.app_role)
        AND public.can_trainer_write()
        AND (
          (storage.foldername(objects.name))[1] = auth.uid()::text
          OR EXISTS (
            SELECT 1 FROM public.exercises e
            WHERE e.id::text = (storage.foldername(objects.name))[1]
              AND e.created_by = auth.uid()
              AND e.is_global = false
          )
        )
      )
    )
  );
