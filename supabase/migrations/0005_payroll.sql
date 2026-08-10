-- Nineall HR — payroll
-- IMPORTANT: tax / social-security rates are NEVER hardcoded here. They live in
-- `policy_settings` as versioned, effective-dated JSON that HR/accounting must review.
-- See docs/PAYROLL_RULES.md.

create table if not exists earnings_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name_th text not null,
  name_en text,
  is_taxable boolean not null default true,
  is_recurring boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);
create trigger trg_earnings_types_updated_at before update on earnings_types
  for each row execute function set_updated_at();

create table if not exists deduction_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name_th text not null,
  name_en text,
  is_statutory boolean not null default false,
  is_recurring boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);
create trigger trg_deduction_types_updated_at before update on deduction_types
  for each row execute function set_updated_at();

-- Versioned policy config: tax brackets, social security rate/cap, OT multipliers, rounding rules.
-- `value` shape is documented per setting_type in docs/PAYROLL_RULES.md.
create table if not exists policy_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  setting_type text not null, -- 'social_security' | 'tax_bracket' | 'ot_rate' | 'rounding'
  value jsonb not null,
  effective_date date not null,
  end_date date,
  requires_expert_review boolean not null default true,
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (org_id, setting_type, effective_date)
);
create index if not exists idx_policy_settings_lookup on policy_settings(org_id, setting_type, effective_date desc);

create table if not exists payroll_periods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  label text not null,
  period_start date not null,
  period_end date not null,
  pay_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, period_start, period_end)
);
create trigger trg_payroll_periods_updated_at before update on payroll_periods
  for each row execute function set_updated_at();

create table if not exists payroll_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  payroll_period_id uuid not null references payroll_periods(id) on delete cascade,
  scope_filter jsonb not null default '{}'::jsonb, -- {branch_ids, department_ids, employee_ids}
  status payroll_run_status not null default 'draft',
  employee_count integer not null default 0,
  total_gross_amount numeric(16,2) not null default 0,
  total_deduction_amount numeric(16,2) not null default 0,
  total_net_amount numeric(16,2) not null default 0,
  calculated_at timestamptz,
  submitted_at timestamptz,
  submitted_by uuid,
  approved_at timestamptz,
  approved_by uuid,
  locked_at timestamptz,
  locked_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
create trigger trg_payroll_runs_updated_at before update on payroll_runs
  for each row execute function set_updated_at();
create index if not exists idx_payroll_runs_period on payroll_runs(payroll_period_id);

-- One row per employee per payroll run. This is a SNAPSHOT: employee_name/department etc.
-- are copied in at calculation time so history doesn't drift when the employee record changes later.
create table if not exists payroll_employee_calculations (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  employee_id uuid not null references employees(id),
  employee_code_snapshot text not null,
  employee_name_snapshot text not null,
  department_snapshot text,
  position_snapshot text,
  employment_type_snapshot employment_type not null,

  base_amount numeric(14,2) not null default 0,
  worked_days numeric(6,2) not null default 0,
  absent_days numeric(6,2) not null default 0,
  late_count integer not null default 0,
  late_minutes_total integer not null default 0,
  unpaid_leave_days numeric(6,2) not null default 0,
  ot_hours numeric(6,2) not null default 0,
  ot_amount numeric(14,2) not null default 0,

  gross_earnings numeric(14,2) not null default 0,
  total_deductions numeric(14,2) not null default 0,
  social_security_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  net_pay numeric(14,2) not null default 0,

  has_anomaly boolean not null default false,
  anomaly_notes text,
  calculation_breakdown jsonb not null default '{}'::jsonb,

  is_mid_cycle_join boolean not null default false,
  is_mid_cycle_exit boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payroll_run_id, employee_id)
);
create trigger trg_payroll_employee_calculations_updated_at before update on payroll_employee_calculations
  for each row execute function set_updated_at();
create index if not exists idx_payroll_calc_run on payroll_employee_calculations(payroll_run_id);
create index if not exists idx_payroll_calc_employee on payroll_employee_calculations(employee_id);

create table if not exists payroll_earning_items (
  id uuid primary key default gen_random_uuid(),
  payroll_calc_id uuid not null references payroll_employee_calculations(id) on delete cascade,
  earning_type_id uuid references earnings_types(id),
  label text not null,
  quantity numeric(10,2),
  rate numeric(14,2),
  amount numeric(14,2) not null,
  note text,
  added_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_payroll_earning_items_calc on payroll_earning_items(payroll_calc_id);

create table if not exists payroll_deduction_items (
  id uuid primary key default gen_random_uuid(),
  payroll_calc_id uuid not null references payroll_employee_calculations(id) on delete cascade,
  deduction_type_id uuid references deduction_types(id),
  label text not null,
  quantity numeric(10,2),
  rate numeric(14,2),
  amount numeric(14,2) not null,
  note text,
  added_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_payroll_deduction_items_calc on payroll_deduction_items(payroll_calc_id);

-- Adjustments/revisions to an already-locked payroll calculation. The locked row is never edited directly.
create table if not exists payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  payroll_calc_id uuid not null references payroll_employee_calculations(id) on delete cascade,
  reason text not null,
  amount_delta numeric(14,2) not null,
  new_net_pay numeric(14,2) not null,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists payslips (
  id uuid primary key default gen_random_uuid(),
  payroll_calc_id uuid not null unique references payroll_employee_calculations(id) on delete cascade,
  employee_id uuid not null references employees(id),
  payroll_period_id uuid not null references payroll_periods(id),
  pdf_file_path text,
  issued_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_payslips_employee on payslips(employee_id, payroll_period_id);
