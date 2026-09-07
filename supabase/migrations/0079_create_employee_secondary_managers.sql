-- Dotted-line / matrix reporting for the org chart: an employee's PRIMARY manager stays
-- employees.manager_employee_id (unchanged) — every approval/permission check in the app
-- (is_manager_of(), leave/OT approval routing, attendance overrides, etc.) keeps working
-- exactly as before, keyed off that single column. This table only adds EXTRA managers shown
-- on the chart as a second (dashed) line — it carries no approval authority and is never read
-- by is_manager_of() or anything else outside the org-chart pages.
create table public.employee_secondary_managers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null references public.employees(id) on delete cascade,
  manager_employee_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  unique (employee_id, manager_employee_id),
  check (employee_id <> manager_employee_id)
);

create index employee_secondary_managers_employee_idx on public.employee_secondary_managers (employee_id);

alter table public.employee_secondary_managers enable row level security;

create policy employee_secondary_managers_select on public.employee_secondary_managers
  for select using (org_id = current_org_id());

create policy employee_secondary_managers_write on public.employee_secondary_managers
  for all using (org_id = current_org_id() and is_admin_or_hr()) with check (org_id = current_org_id() and is_admin_or_hr());
