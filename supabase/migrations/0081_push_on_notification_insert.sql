-- Whenever ANY row is inserted into `notifications` (leave request submitted/decided, OT,
-- note comments, etc.), also push a real OS-level notification to that profile's subscribed
-- devices via the send-push-notification Edge Function — on top of the existing in-app bell.
-- Fire-and-forget: net.http_post is async (queued, checked by pg_net's background worker), so
-- this never blocks or fails the notifications insert itself even if the push send fails.
create or replace function public.notify_push_on_notification_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
begin
  select value into v_secret from app_secrets where key = 'cron_shared_secret';
  if v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://zopfkyfqgvaxawlkuink.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object(
      'profile_id', new.profile_id,
      'title', new.title,
      'body', new.body,
      'url', new.data->>'url'
    )
  );

  return new;
end;
$function$;

drop trigger if exists trg_notify_push_on_notification_insert on notifications;
create trigger trg_notify_push_on_notification_insert
  after insert on notifications
  for each row execute function notify_push_on_notification_insert();
