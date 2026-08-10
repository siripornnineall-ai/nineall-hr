
-- Gap-fill migration for Nineall HR master prompt requirements not covered by the original schema.
-- See ER_DIAGRAM.md section 8 for the full rationale per table.

-- 1. Translation management (master prompt section 5)
create table public.translation_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  key text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

create table public.translations (
  id uuid primary key default gen_random_uuid(),
  translation_key_id uuid not null references public.translation_keys(id) on delete cascade,
  locale text not null check (locale in ('th','en','lo','my')),
  value text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  unique (translation_key_id, locale)
);

create table public.translation_history (
  id uuid primary key default gen_random_uuid(),
  translation_id uuid not null references public.translations(id) on delete cascade,
  old_value text,
  new_value text,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);

alter table public.profiles
  add column preferred_language text not null default 'th' check (preferred_language in ('th','en','lo','my'));

-- 2. Push notification device registry (needed to actually send push per master prompt section 15)
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  push_token text not null,
  platform text not null check (platform in ('ios','android','web')),
  device_name text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (profile_id, push_token)
);

-- 3. Consent log for GPS / camera / document access (master prompt section 19)
create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  consent_type text not null,
  granted boolean not null default true,
  policy_version text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- 4. Loans / salary advance (master prompt section 13)
create table public.loans (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  loan_type text not null default 'loan' check (loan_type in ('loan','salary_advance')),
  principal_amount numeric not null,
  remaining_amount numeric not null,
  installment_amount numeric not null,
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  reason text,
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.loan_installments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  payroll_calc_id uuid references public.payroll_employee_calculations(id),
  due_period_id uuid references public.payroll_periods(id),
  installment_number integer not null,
  amount numeric not null,
  status text not null default 'pending' check (status in ('pending','deducted','skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Custom roles (master prompt section 6 — Super Admin can define custom roles).
-- This is a foundation table only: profiles/role_permissions still key off the `user_role` enum
-- today (see ER_DIAGRAM.md section 8). Wiring custom_roles into the actual permission-check path
-- happens when the Role & Permission screen is built in Phase 1, so the RLS redesign it requires
-- can be done deliberately alongside that UI rather than as a blind schema change now.
create table public.custom_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null,
  name_en text,
  based_on_role user_role,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  unique (org_id, name)
);

-- Triggers
create trigger trg_translation_keys_updated_at before update on public.translation_keys for each row execute function set_updated_at();
create trigger trg_loans_updated_at before update on public.loans for each row execute function set_updated_at();
create trigger trg_loan_installments_updated_at before update on public.loan_installments for each row execute function set_updated_at();
create trigger trg_custom_roles_updated_at before update on public.custom_roles for each row execute function set_updated_at();

-- RLS
alter table public.translation_keys enable row level security;
alter table public.translations enable row level security;
alter table public.translation_history enable row level security;
alter table public.devices enable row level security;
alter table public.consent_records enable row level security;
alter table public.loans enable row level security;
alter table public.loan_installments enable row level security;
alter table public.custom_roles enable row level security;

-- Translations are app-chrome UI strings, not sensitive data, and must be readable on the
-- pre-login screen (language selector) before auth.uid() exists — deliberately public read.
create policy translation_keys_select on public.translation_keys for select using (true);
create policy translations_select on public.translations for select using (true);
create policy translation_keys_write on public.translation_keys for all
  using (org_id = current_org_id() and is_admin_or_hr())
  with check (org_id = current_org_id() and is_admin_or_hr());
create policy translations_write on public.translations for all
  using (exists (select 1 from public.translation_keys tk where tk.id = translation_key_id and tk.org_id = current_org_id()) and is_admin_or_hr())
  with check (exists (select 1 from public.translation_keys tk where tk.id = translation_key_id and tk.org_id = current_org_id()) and is_admin_or_hr());
create policy translation_history_select on public.translation_history for select using (is_admin_or_hr());
create policy translation_history_insert on public.translation_history for insert with check (is_admin_or_hr());

create policy devices_select on public.devices for select using (profile_id = auth.uid());
create policy devices_write on public.devices for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy consent_records_select on public.consent_records for select using (profile_id = auth.uid());
create policy consent_records_insert on public.consent_records for insert with check (profile_id = auth.uid());

create policy loans_select on public.loans for select using (
  is_self(employee_id) or current_user_role() in ('super_admin','hr','payroll_admin')
);
create policy loans_write on public.loans for all
  using (current_user_role() in ('super_admin','hr','payroll_admin'))
  with check (current_user_role() in ('super_admin','hr','payroll_admin'));

create policy loan_installments_select on public.loan_installments for select using (
  exists (select 1 from public.loans l where l.id = loan_id and (is_self(l.employee_id) or current_user_role() in ('super_admin','hr','payroll_admin')))
);
create policy loan_installments_write on public.loan_installments for all
  using (current_user_role() in ('super_admin','hr','payroll_admin'))
  with check (current_user_role() in ('super_admin','hr','payroll_admin'));

create policy custom_roles_select on public.custom_roles for select using (org_id = current_org_id() and is_admin_or_hr());
create policy custom_roles_write on public.custom_roles for all
  using (org_id = current_org_id() and current_user_role() = 'super_admin')
  with check (org_id = current_org_id() and current_user_role() = 'super_admin');
