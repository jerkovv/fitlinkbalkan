-- Push pri svakom novom in-app obavestenju.
--
-- Sve in-app notifikacije prolaze kroz tabelu notifications, pa AFTER INSERT
-- trigger ovde znaci da svaka vrsta obavestenja (trenutna i buduca, za trenera
-- i za vezbaca) automatski dobije i APNs push.
--
-- Poziv ide asinhrono preko pg_net (net.http_post, schema extensions) ka Edge
-- Function send-push. Async + EXCEPTION guard znace da push NIKAD ne blokira i
-- ne obara insert. (http i pg_cron se NE koriste.)
--
-- Bezbednost: salje se samo title i body koji vec postoje u redu (+ recipient i
-- meta). Autorizacija ka funkciji je service role key, citan iz Vault-a
-- (secret 'service_role_key'); send-push ga poredi sa SUPABASE_SERVICE_ROLE_KEY.

create or replace function public.tg_notifications_send_push()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  v_key text;
  v_url text := 'https://iyvvskywmqtudafapxdk.supabase.co/functions/v1/send-push';
begin
  -- Service role key iz Vault-a. Ako nije postavljen, tiho preskoci (bez push-a),
  -- ali ne lomi insert.
  select decrypted_secret
    into v_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if v_key is null then
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'user_id', new.recipient_id,
      'title',   new.title,
      'body',    new.body,
      'meta',    new.meta
    ),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 5000
  );

  return new;
exception when others then
  -- Push je best-effort: nikad ne obaraj insert obavestenja.
  return new;
end;
$$;

drop trigger if exists trg_notifications_send_push on public.notifications;

create trigger trg_notifications_send_push
after insert on public.notifications
for each row
execute function public.tg_notifications_send_push();
