-- Nineall HR — settings, permission matrix, audit trail, login security

create table if not exists system_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (org_id, key)
);
create trigger trg_system_settings_updated_at before update on system_settings
  for each row execute function set_updated_at();

-- Fine-grained overrides layered on top of the hardcoded role defaults enforced by RLS.
create table if not exists role_permissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  role user_role not null,
  resource text not null, -- e.g. 'payroll', 'employee_salary', 'audit_log'
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_approve boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, role, resource)
);
create trigger trg_role_permissions_updated_at before update on role_permissions
  for each row execute function set_updated_at();

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  actor_profile_id uuid references profiles(id) on delete set null,
  action text not null, -- e.g. 'attendance.edit', 'leave.approve', 'payroll.lock', 'employee.update'
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_logs_org on audit_logs(org_id, created_at desc);
create index if not exists idx_audit_logs_entity on audit_logs(entity_type, entity_id);
create index if not exists idx_audit_logs_actor on audit_logs(actor_profile_id, created_at desc);

create table if not exists login_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  event_type text not null, -- login_success | login_failed | logout | password_reset | logout_all_devices
  device_info text,
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists idx_login_events_profile on login_events(profile_id, created_at desc);
