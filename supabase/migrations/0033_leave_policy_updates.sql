-- Nineall HR — leave policy updates per company rules given by the user:
--
-- ลากิจ (personal leave): notice period 3 -> 1 working day.
--
-- ลาพักร้อน (annual/vacation leave): notice period 7 -> 3 working days, and entitlement
-- becomes tenure-tiered (1yr=6d, 2-3yr=8d, 4-6yr=10d, 7yr+=15d) instead of a flat 6 days
-- for anyone past 1 year. leave_policies' old unique constraint (leave_type_id,
-- effective_date) only allowed one row per type per date, which can't express multiple
-- tenure tiers at the same policy version — widened to include min_service_months so
-- each tier is its own row. grantLeaveBalancesForEmployee (employees/actions.ts) is
-- updated separately to pick the highest tier an employee's tenure currently qualifies
-- for, instead of just the single latest-dated row.
--
-- Work From Home: min_service_months was seeded as 119 — almost certainly meant to be
-- "119 days" (this company's fixed probation length, see calculateProbationEndDate)
-- but landed in a column measured in months, making WFH require ~9.9 years of tenure.
-- Corrected to 4 months (119 days rounded up), matching the actual "after probation"
-- policy rule.

alter table leave_policies drop constraint if exists leave_policies_leave_type_id_effective_date_key;
alter table leave_policies add constraint leave_policies_leave_type_id_min_service_months_effective_date_key
  unique (leave_type_id, min_service_months, effective_date);

update leave_policies set notice_days_required = 1
  where leave_type_id = '00000000-0000-0000-0000-000000000702'; -- PERSONAL

update leave_policies set notice_days_required = 3
  where leave_type_id = '00000000-0000-0000-0000-000000000703'; -- VACATION (also fixes the 1-year tier row already at min_service_months=12)

insert into leave_policies (leave_type_id, effective_date, days_per_year, min_service_months, notice_days_required, allow_half_day, requires_attachment)
values
  ('00000000-0000-0000-0000-000000000703', '2026-01-01', 8, 24, 3, true, false),
  ('00000000-0000-0000-0000-000000000703', '2026-01-01', 10, 48, 3, true, false),
  ('00000000-0000-0000-0000-000000000703', '2026-01-01', 15, 84, 3, true, false)
on conflict (leave_type_id, min_service_months, effective_date) do nothing;

update leave_policies set min_service_months = 4
  where leave_type_id = '00000000-0000-0000-0000-000000000712' and min_service_months = 119; -- WFH
