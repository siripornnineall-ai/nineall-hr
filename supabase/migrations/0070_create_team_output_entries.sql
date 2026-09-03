create table public.team_output_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  team_name text not null,
  month date not null,
  quantity numeric(12,2) not null default 0,
  unit text not null default 'ชิ้น',
  note text,
  updated_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, team_name, month)
);

alter table public.team_output_entries enable row level security;

create policy team_output_entries_select on public.team_output_entries
  for select using (org_id = current_org_id());

create policy team_output_entries_insert on public.team_output_entries
  for insert with check (org_id = current_org_id());

create policy team_output_entries_update on public.team_output_entries
  for update using (org_id = current_org_id()) with check (org_id = current_org_id());
