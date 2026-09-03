-- Holds server-only secrets (VAPID push keys, cron shared secret) that Edge Functions read
-- at runtime using the service-role key. RLS is enabled with NO policies, so anon/authenticated
-- roles get zero access via PostgREST; only the service role (which bypasses RLS) can read this.
create table public.app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_secrets enable row level security;
