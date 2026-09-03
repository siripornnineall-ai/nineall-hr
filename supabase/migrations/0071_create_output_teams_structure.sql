-- Replaces the earlier flat team_output_entries table with a proper team model:
-- roster (who's in the team / who's lead, admin-managed), and per-team-type daily entries.
drop table if exists public.team_output_entries;

create table public.output_teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  slug text not null,
  name text not null,
  shift_end_time time,
  notify_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

create table public.output_team_members (
  id uuid primary key default gen_random_uuid(),
  output_team_id uuid not null references public.output_teams(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  is_lead boolean not null default false,
  managed_pages text[],
  created_at timestamptz not null default now(),
  unique (output_team_id, employee_id)
);

create table public.output_team_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  output_team_id uuid not null references public.output_teams(id) on delete cascade,
  work_date date not null,
  is_none boolean not null default false,
  quantity numeric(12,2),
  defect_count integer,
  defect_photo_paths text[],
  sales_data jsonb,
  content_note text,
  submitted_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (output_team_id, work_date)
);

create index output_team_entries_month_idx on public.output_team_entries (output_team_id, work_date);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.output_teams enable row level security;
alter table public.output_team_members enable row level security;
alter table public.output_team_entries enable row level security;
alter table public.push_subscriptions enable row level security;

create policy output_teams_select on public.output_teams
  for select using (org_id = current_org_id());
create policy output_teams_admin_write on public.output_teams
  for all using (org_id = current_org_id() and is_admin_or_hr()) with check (org_id = current_org_id() and is_admin_or_hr());

create policy output_team_members_select on public.output_team_members
  for select using (exists (select 1 from output_teams t where t.id = output_team_id and t.org_id = current_org_id()));
create policy output_team_members_admin_write on public.output_team_members
  for all using (exists (select 1 from output_teams t where t.id = output_team_id and t.org_id = current_org_id()) and is_admin_or_hr())
  with check (exists (select 1 from output_teams t where t.id = output_team_id and t.org_id = current_org_id()) and is_admin_or_hr());

create policy output_team_entries_select on public.output_team_entries
  for select using (org_id = current_org_id());
create policy output_team_entries_write on public.output_team_entries
  for all using (
    org_id = current_org_id()
    and (is_admin_or_hr() or exists (
      select 1 from output_team_members m where m.output_team_id = output_team_entries.output_team_id and m.employee_id = current_employee_id()
    ))
  )
  with check (
    org_id = current_org_id()
    and (is_admin_or_hr() or exists (
      select 1 from output_team_members m where m.output_team_id = output_team_entries.output_team_id and m.employee_id = current_employee_id()
    ))
  );

create policy push_subscriptions_self on public.push_subscriptions
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

insert into output_teams (org_id, slug, name, shift_end_time, notify_enabled) values
  ('00000000-0000-0000-0000-000000000001', 'sewing', 'ทีมเย็บ', '20:00', true),
  ('00000000-0000-0000-0000-000000000001', 'pack', 'ทีมแพ็ค', '18:00', true),
  ('00000000-0000-0000-0000-000000000001', 'sales', 'ทีมขาย', '18:00', true),
  ('00000000-0000-0000-0000-000000000001', 'content', 'ทีมคอนเทนต์', '18:00', true),
  ('00000000-0000-0000-0000-000000000001', 'cutting', 'ทีมตัด', null, false);
