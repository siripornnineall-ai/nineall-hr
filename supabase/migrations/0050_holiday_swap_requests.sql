-- Some employees don't normally have a public holiday off (e.g. warehouse/retail staff on
-- a rotating schedule) and instead work through it, taking a different day off in exchange.
-- This lets an employee record that swap themselves; HR approval (decideHolidaySwapRequest
-- in admin-web) is what actually flips shift_assignments for both dates.
create table if not exists holiday_swap_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  holiday_date date not null,
  substitute_date date not null,
  reason text,
  status approval_status not null default 'pending',
  decided_at timestamptz,
  decided_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_holiday_swap_requests_updated_at before update on holiday_swap_requests
  for each row execute function set_updated_at();

alter table holiday_swap_requests enable row level security;
create policy holiday_swap_select on holiday_swap_requests for select
  using (org_id = current_org_id() and (is_admin_or_hr() or is_self(employee_id) or is_manager_of(employee_id)));
create policy holiday_swap_insert on holiday_swap_requests for insert
  with check (org_id = current_org_id() and is_self(employee_id) and status = 'pending');
create policy holiday_swap_update on holiday_swap_requests for update
  using (org_id = current_org_id() and is_admin_or_hr())
  with check (org_id = current_org_id() and is_admin_or_hr());
