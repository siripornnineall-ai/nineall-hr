-- Nineall HR — leave and overtime

create table if not exists leave_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name_th text not null,
  name_en text,
  is_paid boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);
create trigger trg_leave_types_updated_at before update on leave_types
  for each row execute function set_updated_at();

-- Effective-dated policy per leave type. New rules = new row, never mutate history.
create table if not exists leave_policies (
  id uuid primary key default gen_random_uuid(),
  leave_type_id uuid not null references leave_types(id) on delete cascade,
  effective_date date not null,
  end_date date,
  days_per_year numeric(6,2) not null default 0,
  min_service_months integer not null default 0,
  notice_days_required integer not null default 0,
  requires_attachment boolean not null default false,
  allow_half_day boolean not null default true,
  allow_hourly boolean not null default false,
  carry_over_allowed boolean not null default false,
  carry_over_max_days numeric(6,2) not null default 0,
  carry_over_expiry_month integer,
  carry_over_expiry_day integer,
  max_concurrent_team_requests integer,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (leave_type_id, effective_date)
);
create index if not exists idx_leave_policies_type on leave_policies(leave_type_id, effective_date desc);

create table if not exists leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  leave_type_id uuid not null references leave_types(id) on delete cascade,
  year integer not null,
  entitled_days numeric(6,2) not null default 0,
  carried_over_days numeric(6,2) not null default 0,
  used_days numeric(6,2) not null default 0,
  pending_days numeric(6,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, leave_type_id, year)
);
create trigger trg_leave_balances_updated_at before update on leave_balances
  for each row execute function set_updated_at();

create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  leave_type_id uuid not null references leave_types(id),
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  unit leave_unit not null default 'full_day',
  total_days numeric(6,2) not null,
  reason text,
  delegate_employee_id uuid references employees(id) on delete set null,
  attachment_file_path text,
  status approval_status not null default 'pending',
  cancelled_at timestamptz,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_leave_requests_updated_at before update on leave_requests
  for each row execute function set_updated_at();
create index if not exists idx_leave_requests_employee on leave_requests(employee_id, start_date desc);
create index if not exists idx_leave_requests_org_status on leave_requests(org_id, status);
create index if not exists idx_leave_requests_dates on leave_requests(start_date, end_date);

create table if not exists overtime_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  work_date date not null,
  start_time time not null,
  end_time time not null,
  requested_hours numeric(5,2) not null,
  approved_hours numeric(5,2),
  rate_multiplier numeric(4,2) not null default 1.5,
  reason text,
  task_description text,
  attachment_file_path text,
  status approval_status not null default 'pending',
  attendance_id uuid references attendance_records(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_overtime_requests_updated_at before update on overtime_requests
  for each row execute function set_updated_at();
create index if not exists idx_overtime_requests_employee on overtime_requests(employee_id, work_date desc);
create index if not exists idx_overtime_requests_org_status on overtime_requests(org_id, status);
