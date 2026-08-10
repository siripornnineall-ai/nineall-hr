-- Nineall HR — organizations, structure, and people

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  tax_id text,
  logo_url text,
  timezone text not null default 'Asia/Bangkok',
  default_currency text not null default 'THB',
  default_language text not null default 'th',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_organizations_updated_at before update on organizations
  for each row execute function set_updated_at();

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  address text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_branches_updated_at before update on branches
  for each row execute function set_updated_at();

create table if not exists work_locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  radius_meters integer not null default 150,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_work_locations_updated_at before update on work_locations
  for each row execute function set_updated_at();

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  name_en text,
  color_hex text default '#af101a',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_departments_updated_at before update on departments
  for each row execute function set_updated_at();

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  department_id uuid references departments(id) on delete set null,
  name text not null,
  manager_employee_id uuid, -- FK added after employees table exists
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_teams_updated_at before update on teams
  for each row execute function set_updated_at();

create table if not exists job_positions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  title_en text,
  department_id uuid references departments(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_job_positions_updated_at before update on job_positions
  for each row execute function set_updated_at();

-- Employees: the HR record. One row per person, independent of whether they yet have a login.
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  employee_code text not null,
  first_name text not null,
  last_name text not null,
  nickname text,
  photo_url text,
  date_of_birth date,
  gender text,
  phone text,
  personal_email text,
  address text,
  branch_id uuid references branches(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  team_id uuid references teams(id) on delete set null,
  job_position_id uuid references job_positions(id) on delete set null,
  manager_employee_id uuid references employees(id) on delete set null,
  employment_type employment_type not null default 'monthly',
  employment_status employment_status not null default 'active',
  hire_date date not null,
  probation_end_date date,
  resignation_date date,
  termination_date date,
  national_id_masked text,
  tax_id_masked text,
  social_security_id_masked text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  unique (org_id, employee_code)
);
create trigger trg_employees_updated_at before update on employees
  for each row execute function set_updated_at();
create index if not exists idx_employees_org on employees(org_id);
create index if not exists idx_employees_manager on employees(manager_employee_id);
create index if not exists idx_employees_department on employees(department_id);
create index if not exists idx_employees_team on employees(team_id);

alter table teams
  add constraint fk_teams_manager foreign key (manager_employee_id) references employees(id) on delete set null;

-- User accounts: 1:1 with Supabase auth.users. Holds role/auth-specific state.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid unique references employees(id) on delete cascade,
  role user_role not null default 'employee',
  full_name text not null,
  email text,
  must_change_password boolean not null default true,
  pin_hash text,
  failed_login_count integer not null default 0,
  locked_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated_at before update on profiles
  for each row execute function set_updated_at();
create index if not exists idx_profiles_org on profiles(org_id);
create index if not exists idx_profiles_role on profiles(role);

-- Employment history: effective-dated changes to department/position/team/manager/employment_type.
create table if not exists employment_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  effective_date date not null,
  end_date date,
  department_id uuid references departments(id),
  team_id uuid references teams(id),
  job_position_id uuid references job_positions(id),
  employment_type employment_type not null,
  manager_employee_id uuid references employees(id),
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists idx_employment_records_employee on employment_records(employee_id, effective_date desc);

-- Effective-dated compensation (base pay). Never overwritten — new row per change.
create table if not exists employee_compensation (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  effective_date date not null,
  end_date date,
  employment_type employment_type not null,
  base_amount numeric(14,2) not null,
  -- monthly: base_amount is monthly salary. daily/hourly: base_amount is per-day/per-hour rate.
  position_allowance numeric(14,2) not null default 0,
  transport_allowance numeric(14,2) not null default 0,
  meal_allowance numeric(14,2) not null default 0,
  diligence_allowance numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (employee_id, effective_date)
);
create index if not exists idx_employee_compensation_employee on employee_compensation(employee_id, effective_date desc);

create table if not exists emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  name text not null,
  relationship text,
  phone text not null,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_emergency_contacts_updated_at before update on emergency_contacts
  for each row execute function set_updated_at();

-- Bank accounts: account number is stored masked at the presentation layer.
-- Full number lives only here, behind RLS, never returned to Manager role.
create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  bank_name text not null,
  account_name text not null,
  account_number text not null,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_bank_accounts_updated_at before update on bank_accounts
  for each row execute function set_updated_at();

create table if not exists employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  document_type text not null,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_employee_documents_employee on employee_documents(employee_id);
