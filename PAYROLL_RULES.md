# Payroll Rules — Nineall HR

> **⚠️ The tax bracket and social security numbers shipped in
> `supabase/seed/001_reference_data.sql` are placeholders for demoing the
> calculation engine. They are NOT verified against current Thai law. An
> accountant or payroll expert MUST review and update `policy_settings`
> before this system is used to pay real employees.** Every seeded
> `policy_settings` row has `requires_expert_review = true` for exactly this
> reason.

## Where the logic lives

`packages/payroll-engine` — plain TypeScript, zero UI/DB dependencies, unit
tested with Vitest (`npm run test:payroll`, 21 tests covering the scenarios in
master-prompt §9 and §12). Two entry points:

- `computeAttendance(input)` — one day's clock-in/out → status, late minutes,
  early-leave minutes, worked minutes, OT minutes. Handles overnight shifts,
  multiple breaks, holidays, WFH/off-site, half-day leave, missing clock-out.
- `calculatePayrollForEmployee(input)` — one employee, one payroll period →
  full earnings/deductions breakdown, gross, net, social security, tax,
  anomaly flags.

Both are pure functions: same input always produces the same output, which is
what makes "recalculate before lock" (master prompt §7.9) safe and cheap.

## Money handling

All amounts are computed in **integer satang** (1 THB = 100 satang) via
`packages/payroll-engine/src/money.ts`, converting to/from THB only at the
database boundary. This avoids the classic `0.1 + 0.2 !== 0.3` floating-point
drift accumulating across thousands of payroll line items.

## Base pay by employment type

| Type | Base amount meaning | How it's paid |
|---|---|---|
| `monthly` | Monthly salary | Full amount unless mid-cycle join/exit, in which case prorated by calendar days employed ÷ total calendar days in the period. |
| `daily` | Rate per day | `rate × count of worked days` (days with a "worked" attendance status). |
| `hourly` | Rate per hour | `rate × total worked hours` (sum of `workedMinutes / 60` across the period). |
| `part_time` | Rate per day (same math as `daily`) | |
| `contract` | Fixed amount for the period | Paid in full, not prorated. |

## Deductions

- **Unpaid leave**: `dailyRate × unpaidLeaveDays`, where `dailyRate` for a
  monthly employee is `baseAmount / scheduledWorkDaysInPeriod`.
- **Absence / late penalties**: only applied if the org configures
  `absentPenaltyPerDaySatang` / `latePenaltyPerMinuteSatang` — off by default.
- **Social security**: `min(clamp(gross, minBase, maxContribution/rate) × rate, maxContribution)`,
  fully driven by `policy_settings.social_security` — see shape below.
- **Tax**: a **simplified** withholding estimate — annualizes the monthly
  gross (`× 12`), applies the configured progressive brackets, divides the
  resulting annual tax by 12. This deliberately ignores personal
  allowances/deductions that real Thai PIT withholding accounts for. Treat it
  as a placeholder calculation shape, not a compliant implementation.

## OT

Only `overtime_requests` with `status = 'approved'` are ever included — a
pending or rejected OT request contributes nothing to payroll (master prompt
test case: "OT ที่ยังไม่อนุมัติไม่เข้า Payroll"). Rate = the employee's
effective hourly rate × `rate_multiplier` (from the approved request, itself
defaulted from `policy_settings.ot_rate`).

## `policy_settings` shapes

```jsonc
// setting_type = 'social_security'
{ "employeeRate": 0.05, "minBaseSatang": 165000, "maxContributionSatang": 75000 }

// setting_type = 'tax_bracket' (cumulative, ordered, last entry has uptoSatang: null)
[
  { "uptoSatang": 15000000, "rate": 0 },
  { "uptoSatang": 30000000, "rate": 0.05 },
  { "uptoSatang": null, "rate": 0.25 }
]

// setting_type = 'ot_rate'
{ "normal": 1.5, "holiday": 3 }
```

Each row is effective-dated (`effective_date`, optional `end_date`) so
historical payroll runs keep using the rates that were in force at the time —
never edit an old row, insert a new one.

## Anomalies that block approval

`calculatePayrollForEmployee` sets `hasAnomaly = true` (and admin-web's
"Submit for approval" action refuses to proceed while any calculation in the
run has an anomaly) when:

- Net pay would be negative.
- OT hours in the period exceed 100 (sanity check, not a legal limit).
- More than 3 absences in the period.
- `scheduledWorkDaysInPeriod` is 0 for a monthly employee (config problem).
- No compensation record or no attendance data was found for the employee at
  all (missing data, not a calculation the system should silently trust).

## Locking

Once a `payroll_runs.status = 'locked'`, the `block_locked_payroll_edit`
Postgres trigger rejects any direct UPDATE to that run's
`payroll_employee_calculations` rows. Corrections after lock must go through
`payroll_adjustments` (a new row: reason, amount delta, new net pay) — the
original locked snapshot is preserved for audit.
