-- Two things HR asked for on the payroll edit panel:
-- 1. A toggle for whether social security is auto-calculated from the policy rate, or
--    entered by hand for this employee (e.g. an SSF exemption).
-- 2. Splitting withholding tax into section 40(1) (auto, based on base salary only — the
--    standard employment-income PIT calc) and 40(2) (other taxable benefits, which HR
--    computes and enters manually — the payroll engine has no rule for these).
-- tax_amount is kept as the total of the two, so existing consumers (payslip PDF, reports)
-- that read it as "total withholding" keep working unchanged.
alter table payroll_employee_calculations
  add column if not exists social_security_auto_calc boolean not null default true,
  add column if not exists wht_40_1_amount numeric(12, 2) not null default 0,
  add column if not exists wht_40_2_amount numeric(12, 2) not null default 0;

update payroll_employee_calculations
set wht_40_1_amount = tax_amount
where wht_40_1_amount = 0 and tax_amount <> 0;
