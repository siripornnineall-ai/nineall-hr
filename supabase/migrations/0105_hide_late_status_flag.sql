-- Owner rule (2026-10-12), for Ice (90026) and Kanin (90031): the attendance screens show
-- "ตรงเวลา" instead of "มาสาย", while the late minutes stay on the record so they are still
-- deducted from OT (payroll and the OT page read late_minutes, not the label). This flag only
-- changes what is displayed; attendance_records.status is untouched.
alter table employees add column if not exists hide_late_status boolean not null default false;

update employees set hide_late_status = true
 where employee_code in ('90026', '90031') and deleted_at is null;
