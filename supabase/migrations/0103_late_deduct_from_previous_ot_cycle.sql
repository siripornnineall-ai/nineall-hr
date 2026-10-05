-- Owner rule (2026-10-05), for Kanin (90031) only: when she is late and does not make it up,
-- those minutes come off the OT of the cycle that has just closed (the one being paid now)
-- instead of waiting for the cycle the lateness fell in.
--
-- late_deduct_from_prev_ot_since is the OT-window start date from which the rule applies
-- (NULL = rule off). Payroll uses it to find the first run under the rule; later runs pick up
-- lateness from the previous run's calculation date onward, so every late minute is taken
-- exactly once. See apps/admin-web/src/lib/lateDeduction.ts.
alter table employees add column if not exists late_deduct_from_prev_ot_since date;

update employees
   set late_deduct_from_prev_ot_since = date '2026-08-26'
 where employee_code = '90031' and deleted_at is null;
