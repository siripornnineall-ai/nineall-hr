# ER Diagram — Nineall HR

Generated directly from the live schema (`supabase/migrations/0001`–`0016`,
all applied to the `nineall-hr` Supabase project, `zopfkyfqgvaxawlkuink`) —
not hand-drawn from memory. Split into domain diagrams because one 52-table
diagram is unreadable; `DATABASE_SCHEMA.md` has the prose walkthrough
(triggers, RLS, conventions) this file doesn't repeat.

Every table also has `org_id → organizations(id)` for multi-tenant scoping
except where it hangs off another org-scoped row instead (e.g.
`shift_assignments` doesn't need its own `org_id` check beyond `employees`).
That edge is omitted from each diagram below to keep them legible — assume
every table is org-scoped unless it's a pure join table.

## 1. Organization & People (`0002`)

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ BRANCHES : has
    ORGANIZATIONS ||--o{ WORK_LOCATIONS : has
    ORGANIZATIONS ||--o{ DEPARTMENTS : has
    ORGANIZATIONS ||--o{ TEAMS : has
    ORGANIZATIONS ||--o{ JOB_POSITIONS : has
    ORGANIZATIONS ||--o{ EMPLOYEES : has
    DEPARTMENTS ||--o{ TEAMS : contains
    BRANCHES ||--o{ EMPLOYEES : "assigned to"
    DEPARTMENTS ||--o{ EMPLOYEES : "assigned to"
    TEAMS ||--o{ EMPLOYEES : "assigned to"
    JOB_POSITIONS ||--o{ EMPLOYEES : "assigned to"
    EMPLOYEES ||--o{ EMPLOYEES : "manages (manager_employee_id)"
    EMPLOYEES ||--o| PROFILES : "has login account"
    EMPLOYEES ||--o{ EMPLOYMENT_RECORDS : "history of"
    EMPLOYEES ||--o{ EMPLOYEE_COMPENSATION : "effective-dated pay"
    EMPLOYEES ||--o{ EMERGENCY_CONTACTS : has
    EMPLOYEES ||--o{ BANK_ACCOUNTS : has
    EMPLOYEES ||--o{ EMPLOYEE_DOCUMENTS : has
```

`employees` (HR record) and `profiles` (1:1 with `auth.users`, holds `role` +
`preferred_language`) are deliberately separate — an employee can exist
before they have login credentials. `profiles.role` now includes
`payroll_admin` (added `0013`, master prompt §6's 5 roles).

## 2. Attendance & Shifts (`0003`)

```mermaid
erDiagram
    EMPLOYEES ||--o{ SHIFT_ASSIGNMENTS : "scheduled"
    WORK_SHIFTS ||--o{ SHIFT_ASSIGNMENTS : defines
    WORK_LOCATIONS ||--o{ SHIFT_ASSIGNMENTS : at
    SHIFT_ASSIGNMENTS ||--o{ SHIFT_SWAP_REQUESTS : "original/target"
    EMPLOYEES ||--o{ SHIFT_SWAP_REQUESTS : "requests/targets"
    EMPLOYEES ||--o{ ATTENDANCE_RECORDS : "clocks in/out"
    WORK_SHIFTS ||--o{ ATTENDANCE_RECORDS : "scheduled against"
    WORK_LOCATIONS ||--o{ ATTENDANCE_RECORDS : "at"
    ATTENDANCE_RECORDS ||--o{ BREAK_RECORDS : has
    ATTENDANCE_RECORDS ||--o{ TIME_CORRECTION_REQUESTS : "disputes"
    EMPLOYEES ||--o{ TIME_CORRECTION_REQUESTS : requests
    EMPLOYEES ||--o{ APPROVAL_STEPS : "approves (approver)"
    BRANCHES ||--o{ COMPANY_HOLIDAYS : "observes"
```

`approval_steps` is polymorphic (`request_type` + `request_id`, no FK) —
it's the generic approval engine (master prompt §11) shared by leave, OT,
time-correction, shift-swap, and payroll-period sign-off. That's a
deliberate denormalization, not a missed foreign key.

## 3. Leave, Overtime & Approvals (`0004`)

```mermaid
erDiagram
    LEAVE_TYPES ||--o{ LEAVE_POLICIES : "effective-dated rules"
    LEAVE_TYPES ||--o{ LEAVE_BALANCES : "tracked per"
    LEAVE_TYPES ||--o{ LEAVE_REQUESTS : "type of"
    EMPLOYEES ||--o{ LEAVE_BALANCES : "entitled/used/pending"
    EMPLOYEES ||--o{ LEAVE_REQUESTS : requests
    EMPLOYEES ||--o{ LEAVE_REQUESTS : "delegates approval for"
    EMPLOYEES ||--o{ OVERTIME_REQUESTS : requests
    ATTENDANCE_RECORDS ||--o{ OVERTIME_REQUESTS : "actual hours vs"
```

`leave_balances` (entitled/carried-over/used/pending, per employee/type/year)
is maintained by DB triggers (`validate_and_reserve_leave_balance`,
`apply_leave_decision` — see `DATABASE_SCHEMA.md`), not application code, so
balance integrity survives even a direct-SQL edit.

## 4. Payroll & Loans (`0005`, `0014`)

```mermaid
erDiagram
    PAYROLL_PERIODS ||--o{ PAYROLL_RUNS : "calculated for"
    PAYROLL_RUNS ||--o{ PAYROLL_EMPLOYEE_CALCULATIONS : contains
    EMPLOYEES ||--o{ PAYROLL_EMPLOYEE_CALCULATIONS : "calculated for"
    PAYROLL_EMPLOYEE_CALCULATIONS ||--o{ PAYROLL_EARNING_ITEMS : itemizes
    EARNINGS_TYPES ||--o{ PAYROLL_EARNING_ITEMS : "type of"
    PAYROLL_EMPLOYEE_CALCULATIONS ||--o{ PAYROLL_DEDUCTION_ITEMS : itemizes
    DEDUCTION_TYPES ||--o{ PAYROLL_DEDUCTION_ITEMS : "type of"
    PAYROLL_EMPLOYEE_CALCULATIONS ||--o{ PAYROLL_ADJUSTMENTS : "post-lock corrections"
    PAYROLL_EMPLOYEE_CALCULATIONS ||--o| PAYSLIPS : produces
    EMPLOYEES ||--o{ PAYSLIPS : "receives"
    PAYROLL_PERIODS ||--o{ PAYSLIPS : "for period"
    EMPLOYEES ||--o{ LOANS : "owes"
    LOANS ||--o{ LOAN_INSTALLMENTS : "repaid via"
    PAYROLL_EMPLOYEE_CALCULATIONS ||--o{ LOAN_INSTALLMENTS : "deducted in"
    PAYROLL_PERIODS ||--o{ LOAN_INSTALLMENTS : "due in"
```

`payroll_employee_calculations` is a **snapshot** — employee name/department/
position are copied in at calculation time so a later org-chart change
doesn't rewrite payroll history. `policy_settings` (versioned tax/SS/OT
config, not diagrammed here — it's a standalone effective-dated table with
no FK, see `PAYROLL_RULES.md`) is what makes formula changes not retroactive.

## 5. Announcements, Notifications, Files, Devices, Consent (`0006`, `0014`)

```mermaid
erDiagram
    ANNOUNCEMENTS ||--o{ ANNOUNCEMENT_READS : "read by"
    EMPLOYEES ||--o{ ANNOUNCEMENT_READS : reads
    PROFILES ||--o{ NOTIFICATIONS : "receives"
    PROFILES ||--o{ DEVICES : "registers (push tokens)"
    PROFILES ||--o{ CONSENT_RECORDS : "grants (GPS/camera/docs)"
    PROFILES ||--o{ LOGIN_EVENTS : "logs in via"
```

`uploaded_files` (generic file registry, org-scoped only) and
`system_settings` (org-scoped key/value) have no other FKs and aren't
diagrammed.

## 6. Translation Management (`0014` — new this session, see §8)

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ TRANSLATION_KEYS : owns
    TRANSLATION_KEYS ||--o{ TRANSLATIONS : "th/en/lo/my value"
    TRANSLATIONS ||--o{ TRANSLATION_HISTORY : "edit history"
    PROFILES ||--o{ TRANSLATIONS : "last edited by"
    PROFILES ||--o{ TRANSLATION_HISTORY : "changed by"
    PROFILES }o--|| PROFILES : "preferred_language column"
```

One `translations` row per `(translation_key_id, locale)`; a key with fewer
than 4 rows is a "missing translation" the admin-web Translation Management
screen surfaces (master prompt §5).

## 7. Settings, Permissions, Audit, Custom Roles (`0007`, `0014`)

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ SYSTEM_SETTINGS : configures
    ORGANIZATIONS ||--o{ ROLE_PERMISSIONS : "overrides for"
    ORGANIZATIONS ||--o{ CUSTOM_ROLES : defines
    PROFILES ||--o{ CUSTOM_ROLES : "created by"
    PROFILES ||--o{ AUDIT_LOGS : "acted as"
```

## 8. Gap-fill migration rationale (`0014`)

Session-1 schema (`0001`–`0012`) covered the original master prompt closely
but missed a few things the *unified* master prompt
(`Claude_Master_Prompt_Nineall_HR_Web_Android_iOS.md`) makes explicit
requirements. `0014` was applied directly to the live project via the
Supabase MCP tools without a matching local file at the time — this file,
and `0013`–`0016` now existing under `supabase/migrations/`, closes that gap
so the repo matches the live database exactly (master prompt §18: "เขียน
Migration ทุกครั้ง ห้ามแก้ฐานข้อมูลด้วยมือแล้วไม่บันทึก").

| Table/column | Master prompt requirement it fills |
|---|---|
| `translation_keys`, `translations`, `translation_history`, `profiles.preferred_language` | §5 — 4-language system, missing-translation tracking, per-user language memory, edit history |
| `devices` | §15 — push notification device registry (can't send push without a token to send to) |
| `consent_records` | §19 — consent log for GPS/camera/document access |
| `loans`, `loan_installments` | §13 — "เงินกู้" / "เงินเบิกล่วงหน้า" payroll deduction lines need a source table and an installment schedule that payroll can deduct against |
| `custom_roles` | §6 — "Super Admin สามารถสร้าง Custom Role" — foundation table only; not yet wired into the actual permission check (see the table's migration comment) — tracked in `IMPLEMENTATION_STATUS.md` as not done, not silently assumed complete |
| `user_role` enum: `payroll_admin` | §6 — 5th role explicitly required, the original enum only had 4 |
| `approval_status` enum: `more_information_required` | §11 — one of the 6 required approval states, missing from the original enum |
| `lookup_login_email()` (`0016`) | §17 login screen — "Email / Employee ID" combined field needs a way to resolve an employee code to an email pre-auth, without exposing the `profiles`/`employees` tables to anonymous reads |
