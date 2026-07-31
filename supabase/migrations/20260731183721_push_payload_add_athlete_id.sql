CREATE OR REPLACE FUNCTION public.tg_notifications_send_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_url text := 'https://iyvvskywmqtudafapxdk.supabase.co/functions/v1/send-push';
BEGIN
  SELECT decrypted_secret
    INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_key IS NULL THEN
    RETURN new;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'user_id',         new.recipient_id,
      'title',           new.title,
      'body',            new.body,
      'meta',            new.meta,
      'notification_id', new.id,
      'kind',            new.kind,
      'recipient_role',  new.recipient_role,
      'athlete_id',      new.athlete_id
    ),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 5000
  );

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RETURN new;
END;
$$;
