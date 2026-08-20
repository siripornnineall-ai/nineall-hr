-- Nineall HR — allow editing/deleting a payroll calculation on a locked run directly,
-- without unlocking first (explicit request). This trigger (0010) previously blocked
-- any UPDATE to payroll_employee_calculations once its run was locked, in favor of a
-- payroll_adjustments table that was never actually wired into the app (no server
-- action or UI ever wrote to it — updatePayrollCalcAction just blocked edits outright
-- to match this trigger). The app now regenerates that employee's payslip PDF
-- immediately after any edit/delete on a locked run (regeneratePayslipIfLocked in
-- payroll/actions.ts), so the issued PDF stays in sync without needing this guard.

drop trigger if exists trg_block_locked_payroll_edit on payroll_employee_calculations;
drop function if exists block_locked_payroll_edit();
