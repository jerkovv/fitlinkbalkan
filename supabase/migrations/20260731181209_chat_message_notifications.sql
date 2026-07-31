-- Chat do sada nije pravio NIJEDNU notifikaciju, ni push, ni in-app,
-- ni u jednom smeru. Poruka koja stigne dok korisnik nije u aplikaciji
-- je nevidljiva dok sam ne otvori chat. Ovaj triger to popravlja.

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_name text;
  v_preview text;
BEGIN
  v_preview := left(NEW.body, 120);

  IF NEW.sender_id IS NOT DISTINCT FROM NEW.trainer_id THEN
    -- Trener salje -> obavesti vezbaca
    SELECT COALESCE(p.full_name, 'Trener') INTO v_sender_name
    FROM public.profiles p WHERE p.id = NEW.trainer_id;

    INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
    VALUES (
      NEW.athlete_id, 'athlete', NEW.sender_id, NEW.athlete_id, 'message_from_trainer',
      v_sender_name, v_preview,
      jsonb_build_object('message_id', NEW.id)
    );
  ELSE
    -- Vezbac salje -> obavesti trenera, uz postovanje podesavanja
    IF public.should_notify_trainer(NEW.trainer_id, 'messages') THEN
      SELECT COALESCE(p.full_name, 'Vežbač') INTO v_sender_name
      FROM public.profiles p WHERE p.id = NEW.athlete_id;

      INSERT INTO public.notifications (recipient_id, recipient_role, sender_id, athlete_id, kind, title, body, meta)
      VALUES (
        NEW.trainer_id, 'trainer', NEW.sender_id, NEW.athlete_id, 'message',
        v_sender_name, v_preview,
        jsonb_build_object('message_id', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_message ON public.messages;
CREATE TRIGGER trg_notify_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();
