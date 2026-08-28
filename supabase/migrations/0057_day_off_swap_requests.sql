-- Distinct from holiday_swap_requests: that one is specifically for public holidays
-- (holiday_date must be a real company_holidays row). This is for an employee's ordinary
-- weekly day off — e.g. normally off Sat/Sun, wants to swap to be off Monday instead — with
-- no tie to any holiday. Same underlying mechanism (flip shift_assignments.is_day_off for
-- both dates on approval), kept as a separate table/feature to match how HR thinks about
-- these as different entitlements, and so the existing holiday-swap flow is untouched.
create table if not exists day_off_swap_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  original_date date not null,
  substitute_date date not null,
  reason text,
  status approval_status not null default 'pending',
  decided_at timestamptz,
  decided_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (original_date <> substitute_date)
);
create trigger trg_day_off_swap_requests_updated_at before update on day_off_swap_requests
  for each row execute function set_updated_at();

alter table day_off_swap_requests enable row level security;
create policy day_off_swap_select on day_off_swap_requests for select
  using (org_id = current_org_id() and (is_admin_or_hr() or is_self(employee_id) or is_manager_of(employee_id)));
create policy day_off_swap_insert on day_off_swap_requests for insert
  with check (org_id = current_org_id() and is_self(employee_id) and status = 'pending');
create policy day_off_swap_update on day_off_swap_requests for update
  using (org_id = current_org_id() and is_admin_or_hr())
  with check (org_id = current_org_id() and is_admin_or_hr());
