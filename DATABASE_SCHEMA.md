# Database Schema — Nineall HR

Source of truth: `supabase/migrations/*.sql` (numbered, run in order). This
document is a guided tour, not a replacement for reading the SQL.

## Conventions

- Every table uses a `uuid` primary key (`gen_random_uuid()`), `created_at` /
  `updated_at` timestamps (auto-maintained by `set_updated_at()`), and — where
  relevant — `org_id`, `created_by`, `deleted_at` (soft delete).
- Anything HR might change over time (compensation, leave policy, tax/social
  security rates) is **effective-dated**: a new row with a new `effective_date`
  is inserted rather than mutating history. See `employee_compensation`,
  `leave_policies`, `policy_settings`.
- Money is stored as `numeric(14,2)` in Postgres (THB), but the
  `payroll-engine` package computes everything internally in integer satang
  (1 THB = 100 satang) to avoid floating-point rounding error, converting to
  THB only at the database boundary.

## Table groups

### 0002 — Organization & people
`organizations`, `branches`, `work_locations` (GPS + radius), `departments`,
`teams`, `job_positions`, `employees` (the HR record), `profiles` (1:1 with
`auth.users`, holds `role` + login state), `employment_records` (history),
`employee_compensation` (effective-dated pay), `emergency_contacts`,
`bank_accounts`, `employee_documents`.

`employees` and `profiles` are deliberately separate: an employee can exist
in the directory before they have a login account, and `profiles.role`
(`super_admin | hr | manager | employee`) is what RLS and admin-web's route
guard key off.

### 0003 — Attendance
`work_shifts`, `company_holidays`, `shift_assignments` (one row per
employee/day — "what shift are they on"), `shift_swap_requests`,
`approval_steps` (generic, polymorphic — used by leave/OT/time-correction/
shift-swap/payroll via `request_type` + `request_id`), `attendance_records`
(the clock-in/out evidence + computed status), `break_records`,
`time_correction_requests`.

### 0004 — Leave & overtime
`leave_types`, `leave_policies` (effective-dated rules per type),
`leave_balances` (entitled/carried-over/used/pending, per employee/type/year),
`leave_requests`, `overtime_requests`.

### 0005 — Payroll
`earnings_types`, `deduction_types`, `policy_settings` (versioned tax/SS/OT
config — see `PAYROLL_RULES.md`), `payroll_periods`, `payroll_runs`,
`payroll_employee_calculations` (a **snapshot** — employee name/department/
position are copied in at calculation time so history doesn't drift),
`payroll_earning_items`, `payroll_deduction_items`, `payroll_adjustments`
(post-lock corrections), `payslips`.

### 0006 — Announcements, notifications, files
`announcements`, `announcement_reads`, `notifications`, `uploaded_files`
(generic registry, mostly for audit — actual bytes live in Supabase Storage).

### 0007 — Settings, permissions, audit
`system_settings` (generic key/value per org), `role_permissions` (fine-grained
overrides on top of RLS defaults), `audit_logs`, `login_events`.

### 0013–0016 — Gap-fill (session 2, see `ER_DIAGRAM.md` §8 for the full rationale)
`0013` adds the `payroll_admin` role and `more_information_required` approval
status (both required by master prompt §6/§11 but missing from the original
enums). `0014` adds `translation_keys`/`translations`/`translation_history` +
`profiles.preferred_language` (§5 translation management), `devices` (§15
push tokens), `consent_records` (§19 consent log), `loans`/`loan_installments`
(§13 salary advance deductions), and `custom_roles` (§6 foundation table,
not yet wired into the permission check — see that table's own comment).
`0015` fills in indexes the gap-fill tables needed. `0016` adds
`lookup_login_email()`, a `security definer` function the pre-auth login
screen uses to resolve "Email / Employee ID" to a real email without
exposing `profiles`/`employees` to anonymous reads.

## Triggers worth knowing about (`0010_triggers.sql`)

- `write_audit_log()` — generic audit trail on `employees`, `attendance_records`,
  `leave_requests`, `overtime_requests`, `payroll_runs`, `profiles`.
- `validate_and_reserve_leave_balance()` — runs on `leave_requests` INSERT;
  raises `INSUFFICIENT_LEAVE_BALANCE` if the employee doesn't have enough days,
  otherwise reserves `pending_days`.
- `apply_leave_decision()` — runs when `leave_requests.status` changes;
  moves days between `pending_days` / `used_days` correctly for
  approve/reject/cancel.
- `create_first_approval_step()` — auto-creates the requester's manager as
  step 1 of `approval_steps` for new leave/OT/time-correction requests.
- `block_locked_payroll_edit()` — raises `PAYROLL_LOCKED` on any UPDATE to a
  `payroll_employee_calculations` row whose parent run is `locked`.

## Row Level Security

See `0008_rls_helpers.sql` (helper functions: `current_org_id()`,
`current_role()`, `current_employee_id()`, `is_admin_or_hr()`,
`is_manager_of(employee_id)`, `is_self(employee_id)`) and
`0009_rls_policies.sql` (every table's actual policies). The short version:

- Everything is scoped to `org_id = current_org_id()` first.
- `employee` role: sees only rows where they are the subject.
- `manager` role: sees their own rows + rows for employees on their team;
  **never** sees salary, bank accounts, or payroll.
- `hr` / `super_admin`: full access within the org. `audit_logs` is
  `super_admin`-only.

Storage buckets (`0011_storage.sql`) use the same `org_id`/`employee_id`
scoping via a `{org_id}/{employee_id}/...` path convention enforced by
`storage.objects` policies — see `SECURITY_AND_PDPA.md`.
