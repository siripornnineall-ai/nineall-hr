-- Admin Responsibility Management — a completely separate feature from the org chart
-- (per explicit request: no shared data, no manager/report lines, org chart untouched).
-- Tracks which admin covers which sales channel/store, on which days, during which hours,
-- and their main duties — for day-to-day ops visibility, not the reporting hierarchy.

create table public.admin_responsibility_channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- One profile per employee: the "card" info (shift label, duties). Channel coverage with its
-- own days/times lives separately below, since one employee can cover different channels at
-- different hours (e.g. Shopee all day, Lazada mornings only).
create table public.admin_responsibility_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  shift_label text,
  duties text[] not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id)
);

create table public.admin_responsibility_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.admin_responsibility_profiles(id) on delete cascade,
  channel_id uuid not null references public.admin_responsibility_channels(id) on delete cascade,
  work_days text not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now()
);

create index admin_responsibility_schedules_profile_idx on public.admin_responsibility_schedules (profile_id);
create index admin_responsibility_schedules_channel_idx on public.admin_responsibility_schedules (channel_id);

alter table public.admin_responsibility_channels enable row level security;
alter table public.admin_responsibility_profiles enable row level security;
alter table public.admin_responsibility_schedules enable row level security;

-- Viewable by anyone signed into the org (same as the org chart); only super_admin/hr can edit.
create policy admin_responsibility_channels_select on public.admin_responsibility_channels
  for select using (org_id = current_org_id());
create policy admin_responsibility_channels_write on public.admin_responsibility_channels
  for all using (org_id = current_org_id() and is_admin_or_hr()) with check (org_id = current_org_id() and is_admin_or_hr());

create policy admin_responsibility_profiles_select on public.admin_responsibility_profiles
  for select using (org_id = current_org_id());
create policy admin_responsibility_profiles_write on public.admin_responsibility_profiles
  for all using (org_id = current_org_id() and is_admin_or_hr()) with check (org_id = current_org_id() and is_admin_or_hr());

create policy admin_responsibility_schedules_select on public.admin_responsibility_schedules
  for select using (org_id = current_org_id());
create policy admin_responsibility_schedules_write on public.admin_responsibility_schedules
  for all using (org_id = current_org_id() and is_admin_or_hr()) with check (org_id = current_org_id() and is_admin_or_hr());
