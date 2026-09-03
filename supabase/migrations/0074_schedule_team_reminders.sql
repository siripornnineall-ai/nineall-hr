create extension if not exists pg_cron;

select cron.schedule(
  'send-team-reminders-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://zopfkyfqgvaxawlkuink.supabase.co/functions/v1/send-team-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where key = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
