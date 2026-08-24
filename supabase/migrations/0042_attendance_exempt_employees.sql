-- Nineall HR — some employees (owners/family management in this org) never clock
-- in/out at all and are paid their full monthly salary regardless — which the payroll
-- calculator already does correctly for monthly employment_type (base pay isn't
-- prorated by attendance), but every payroll run still flagged them with a false
-- "missing attendance data" anomaly warning since there are zero attendance_records
-- rows to compute from. This lets HR mark specific employees exempt so that warning
-- is suppressed for them specifically, without changing how pay is calculated for
-- anyone (attendance-based deductions/proration for other employment types are
-- untouched).

alter table employees add column if not exists attendance_exempt boolean not null default false;

update employees
set attendance_exempt = true
where id in (
  '02a658d3-241e-4167-b48d-f223711bec4a', -- จิรนันท์ ทรัพย์ศรีโสภา (90016)
  'b5e3c26c-8893-4667-a425-094e8c407eb2', -- จิรานุช ทรัพย์ศรีโสภา (90019)
  'acbf9fa4-1f41-4b7c-953a-21a75b2421f0', -- จิรพงศ์ ทรัพย์ศรีโสภา (90012)
  'aa727690-0360-43b8-9b30-dd686c6dff00'  -- นวพร ซ่อนนอก (90001)
);
