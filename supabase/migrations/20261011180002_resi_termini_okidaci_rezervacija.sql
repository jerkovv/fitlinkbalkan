-- Dva okidaca na session_bookings: povrat treninga kad trener ukloni vezbaca iz termina
-- i obavestenje treneru kad vezbac ponovo rezervise termin koji je ranije otkazao.

-- Trener uklanja vezbaca iz buduceg termina (aplikacija i veb brisu red iz session_bookings).
-- Ranije je red nestajao, a trening je ostajao potrosen pa je trener morao rucno da ispravlja
-- brojku u clanarini. Povrat ide isto kao kad vezbac otkaze u roku.
CREATE OR REPLACE FUNCTION public._tg_vrati_trening_na_uklanjanje()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Samo zauzeto mesto u terminu koji jos nije poceo, i samo kad ga uklanja trener tog termina.
  -- Kasno otkazan red (status cancelled) ostaje naplacen; brisanje celog naloga ne vraca nista.
  IF OLD.status = 'booked'
     AND auth.uid() IS NOT DISTINCT FROM OLD.trainer_id
     AND public._pocetak_termina(OLD.date, OLD.start_time) > now()
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.athlete_id)
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.trainer_id) THEN
    UPDATE public.memberships
       SET sessions_used = GREATEST(0, sessions_used - 1)
     WHERE id = (
       SELECT id FROM public.memberships
        WHERE athlete_id = OLD.athlete_id
          AND trainer_id = OLD.trainer_id
          AND status = 'active'
          AND sessions_total IS NOT NULL
        ORDER BY ends_on DESC NULLS LAST
        LIMIT 1
     );
  END IF;
  RETURN OLD;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._tg_vrati_trening_na_uklanjanje() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_vrati_trening_na_uklanjanje ON public.session_bookings;
CREATE TRIGGER trg_vrati_trening_na_uklanjanje
  AFTER DELETE ON public.session_bookings
  FOR EACH ROW EXECUTE FUNCTION public._tg_vrati_trening_na_uklanjanje();

-- Ponovna rezervacija posle otkazivanja koristi isti red (UPDATE statusa), a obavestenje
-- "rezervisao termin" je islo samo na INSERT. Trener je zato video samo "otkazao termin"
-- iako vezbac dolazi. Ista funkcija sada radi i kad se otkazan red vrati u booked.
DROP TRIGGER IF EXISTS trg_notify_booking_rebooked ON public.session_bookings;
CREATE TRIGGER trg_notify_booking_rebooked
  AFTER UPDATE OF status ON public.session_bookings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM 'booked' AND NEW.status = 'booked')
  EXECUTE FUNCTION public.notify_booking_created();
