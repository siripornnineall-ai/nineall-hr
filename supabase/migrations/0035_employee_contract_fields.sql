-- Nineall HR — additional per-contract fields matching the reference product's
-- Contracts tab: work days/month, work hours/day, payment schedule, and whether the
-- company covers the employee's social security / tax contribution instead of
-- deducting it from pay. These are informational/contract-record fields only — the
-- payroll calculation engine (packages/payroll-engine) does not read them yet, so
-- setting them does not change any payslip math. Wiring them into actual pay
-- calculation is a separate, higher-risk change that needs its own careful design.

alter table employee_compensation
  add column if not exists work_days_per_month numeric(5,2) not null default 30,
  add column if not exists work_hours_per_day numeric(4,2) not null default 8,
  add column if not exists payment_schedule text not null default 'monthly',
  add column if not exists company_covers_ssf boolean not null default false,
  add column if not exists company_covers_tax boolean not null default false;
