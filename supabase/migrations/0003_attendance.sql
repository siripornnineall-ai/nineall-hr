-- Nineall HR — shifts, schedules, attendance, and approvals

create table if not exists work_shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  start_time time not null,
  end_time time not null,
  is_overnight boolean not null default false,
  paid_break_minutes integer not null default 0,
  unpaid_break_minutes integer not null default 60,
  grace_minutes_late integer not null default 0,
  grace_minutes_early_leave integer not null default 0,
  min_work_minutes integer not null default 0,
  ot_before_shift_allowed boolean not null default false,
  ot_after_shift_allowed boolean not null default true,
  round_to_minutes integer not null default 1,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_work_shifts_updated_at before update on work_shifts
  for each row execute function set_updated_at();

create table if not exists company_holidays (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, branch_id, holiday_date)
);
create trigger trg_company_holidays_updated_at before update on company_holidays
  for each row execute function set_updated_at();

-- One row per employee per work date: the source of truth for "what shift are they on".
create table if not exists shift_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  work_date date not null,
  shift_id uuid references work_shifts(id) on delete set null,
  work_location_id uuid references work_locations(id) on delete set null,
  is_day_off boolean not null default false,
  is_work_from_home boolean not null default false,
  is_off_site boolean not null default false,
  source text not null default 'schedule', -- schedule | copied | shift_swap | manual
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (employee_id, work_date)
);
create trigger trg_shift_assignments_updated_at before update on shift_assignments
  for each row execute function set_updated_at();
create index if not exists idx_shift_assignments_date on shift_assignments(work_date);

create table if not exists shift_swap_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  requester_employee_id uuid not null references employees(id) on delete cascade,
  target_employee_id uuid references employees(id) on delete set null,
  original_assignment_id uuid references shift_assignments(id) on delete cascade,
  target_assignment_id uuid references shift_assignments(id) on delete set null,
  reason text,
  status approval_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_shift_swap_requests_updated_at before update on shift_swap_requests
  for each row execute function set_updated_at();

-- Generic, polymorphic approval trail used by leave / overtime / time-correction / shift-swap / payroll.
-- request_type + request_id together identify the parent record (no FK — parent tables vary).
create table if not exists approval_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  request_type text not null, -- 'leave' | 'overtime' | 'time_correction' | 'shift_swap' | 'payroll_run'
  request_id uuid not null,
  step_order integer not null default 1,
  approver_role user_role not null default 'manager',
  approver_employee_id uuid references employees(id) on delete set null,
  status approval_status not null default 'pending',
  comment text,
  acted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_approval_steps_request on approval_steps(request_type, request_id);
create index if not exists idx_approval_steps_approver on approval_steps(approver_employee_id, status);

-- The attendance record for one employee on one work date.
create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  work_date date not null,
  shift_id uuid references work_shifts(id) on delete set null,
  work_location_id uuid references work_locations(id) on delete set null,

  clock_in_device_at timestamptz,
  clock_in_server_at timestamptz,
  clock_in_latitude double precision,
  clock_in_longitude double precision,
  clock_in_accuracy_m double precision,
  clock_in_distance_m double precision,
  clock_in_within_geofence boolean,
  clock_in_selfie_path text,
  clock_in_device_id text,
  clock_in_is_offline_submission boolean not null default false,

  clock_out_device_at timestamptz,
  clock_out_server_at timestamptz,
  clock_out_latitude double precision,
  clock_out_longitude double precision,
  clock_out_accuracy_m double precision,
  clock_out_distance_m double precision,
  clock_out_within_geofence boolean,
  clock_out_selfie_path text,
  clock_out_device_id text,
  clock_out_is_offline_submission boolean not null default false,

  status attendance_status not null default 'absent',
  late_minutes integer not null default 0,
  early_leave_minutes integer not null default 0,
  worked_minutes integer not null default 0,
  ot_minutes integer not null default 0,
  needs_review boolean not null default false,
  review_note text,

  edited_by uuid,
  edited_at timestamptz,
  edit_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, work_date)
);
create trigger trg_attendance_records_updated_at before update on attendance_records
  for each row execute function set_updated_at();
create index if not exists idx_attendance_records_org_date on attendance_records(org_id, work_date);
create index if not exists idx_attendance_records_employee on attendance_records(employee_id, work_date desc);
create index if not exists idx_attendance_records_needs_review on attendance_records(needs_review) where needs_review;

create table if not exists break_records (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references attendance_records(id) on delete cascade,
  break_start_at timestamptz not null,
  break_end_at timestamptz,
  is_paid boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_break_records_attendance on break_records(attendance_id);

create table if not exists time_correction_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  attendance_id uuid references attendance_records(id) on delete set null,
  work_date date not null,
  original_clock_in timestamptz,
  original_clock_out timestamptz,
  requested_clock_in timestamptz,
  requested_clock_out timestamptz,
  reason_type time_correction_reason not null,
  reason_note text,
  evidence_file_path text,
  status approval_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_time_correction_requests_updated_at before update on time_correction_requests
  for each row execute function set_updated_at();
create index if not exists idx_time_correction_employee on time_correction_requests(employee_id, work_date desc);
