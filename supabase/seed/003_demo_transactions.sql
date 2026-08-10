-- Nineall HR — seed: demo attendance / leave / OT / announcements
-- Uses current_date so the dashboard always has believable "today" data regardless
-- of when this seed is run. Re-running is safe (each insert keys off employee+date).

-- On-time employees today.
insert into attendance_records (org_id, employee_id, work_date, shift_id, work_location_id, clock_in_device_at, clock_in_server_at, clock_in_latitude, clock_in_longitude, clock_in_within_geofence, clock_out_device_at, clock_out_server_at, status, worked_minutes)
select '00000000-0000-0000-0000-000000000001', id, current_date, '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000201',
  (current_date::text || 'T08:28:00+07:00')::timestamptz, (current_date::text || 'T08:28:05+07:00')::timestamptz, 13.7466, 100.5393, true,
  (current_date::text || 'T17:32:00+07:00')::timestamptz, (current_date::text || 'T17:32:05+07:00')::timestamptz, 'on_time', 484
from employees
where employee_code in ('EMP-001', 'EMP-002', 'EMP-003', 'EMP-006', 'EMP-007', 'EMP-009', 'EMP-010', 'EMP-012', 'EMP-013', 'EMP-014', 'EMP-016')
  and org_id = '00000000-0000-0000-0000-000000000001'
on conflict (employee_id, work_date) do nothing;

-- Late arrival.
insert into attendance_records (org_id, employee_id, work_date, shift_id, work_location_id, clock_in_device_at, clock_in_server_at, clock_in_latitude, clock_in_longitude, clock_in_within_geofence, clock_out_device_at, clock_out_server_at, status, late_minutes, worked_minutes)
select '00000000-0000-0000-0000-000000000001', id, current_date, '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000201',
  (current_date::text || 'T09:15:00+07:00')::timestamptz, (current_date::text || 'T09:15:05+07:00')::timestamptz, 13.7466, 100.5393, true,
  (current_date::text || 'T17:30:00+07:00')::timestamptz, (current_date::text || 'T17:30:05+07:00')::timestamptz, 'late', 40, 435
from employees where employee_code = 'EMP-005' and org_id = '00000000-0000-0000-0000-000000000001'
on conflict (employee_id, work_date) do nothing;

-- Forgot to clock out — needs HR review.
insert into attendance_records (org_id, employee_id, work_date, shift_id, work_location_id, clock_in_device_at, clock_in_server_at, clock_in_latitude, clock_in_longitude, clock_in_within_geofence, status, needs_review)
select '00000000-0000-0000-0000-000000000001', id, current_date, '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000201',
  (current_date::text || 'T08:31:00+07:00')::timestamptz, (current_date::text || 'T08:31:05+07:00')::timestamptz, 13.7466, 100.5393, true,
  'on_time', true
from employees where employee_code = 'EMP-008' and org_id = '00000000-0000-0000-0000-000000000001'
on conflict (employee_id, work_date) do nothing;

-- Absent — no clock-in at all today.
insert into attendance_records (org_id, employee_id, work_date, shift_id, work_location_id, status, needs_review)
select '00000000-0000-0000-0000-000000000001', id, current_date, '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000201', 'absent', true
from employees where employee_code = 'EMP-011' and org_id = '00000000-0000-0000-0000-000000000001'
on conflict (employee_id, work_date) do nothing;

-- On approved sick leave today.
insert into attendance_records (org_id, employee_id, work_date, status)
select '00000000-0000-0000-0000-000000000001', id, current_date, 'leave'
from employees where employee_code = 'EMP-015' and org_id = '00000000-0000-0000-0000-000000000001'
on conflict (employee_id, work_date) do nothing;

-- Leave balances must exist (with real entitlements from leave_policies) before any
-- leave_requests insert, or validate_and_reserve_leave_balance() rejects everything
-- with INSUFFICIENT_LEAVE_BALANCE (it auto-creates a zero-entitlement row otherwise).
insert into leave_balances (employee_id, leave_type_id, year, entitled_days, carried_over_days, used_days, pending_days)
select e.id, lp.leave_type_id, 2026, lp.days_per_year, 0, 0, 0
from employees e
cross join lateral (
  select lt.id as leave_type_id, lp.days_per_year
  from leave_types lt
  join leave_policies lp on lp.leave_type_id = lt.id
  where lt.org_id = e.org_id
    and lp.effective_date = (select max(lp2.effective_date) from leave_policies lp2 where lp2.leave_type_id = lt.id and lp2.effective_date <= current_date)
) lp
where e.org_id = '00000000-0000-0000-0000-000000000001'
on conflict (employee_id, leave_type_id, year) do nothing;

-- Leave requests: an approved sick leave for today, a pending vacation next week, an approved personal leave last week.
-- No natural unique key on this business table, so each insert is guarded with NOT EXISTS
-- to keep the seed script safely re-runnable.
insert into leave_requests (org_id, employee_id, leave_type_id, start_date, end_date, unit, total_days, reason, status)
select '00000000-0000-0000-0000-000000000001', id, '00000000-0000-0000-0000-000000000701', current_date, current_date, 'full_day', 1, 'ไม่สบาย มีไข้', 'approved'
from employees e
where e.employee_code = 'EMP-015' and e.org_id = '00000000-0000-0000-0000-000000000001'
  and not exists (select 1 from leave_requests lr where lr.employee_id = e.id and lr.leave_type_id = '00000000-0000-0000-0000-000000000701' and lr.start_date = current_date);

insert into leave_requests (org_id, employee_id, leave_type_id, start_date, end_date, unit, total_days, reason, status)
select '00000000-0000-0000-0000-000000000001', id, '00000000-0000-0000-0000-000000000703', current_date + 7, current_date + 9, 'full_day', 3, 'พักผ่อนกับครอบครัว', 'pending'
from employees e
where e.employee_code = 'EMP-016' and e.org_id = '00000000-0000-0000-0000-000000000001'
  and not exists (select 1 from leave_requests lr where lr.employee_id = e.id and lr.leave_type_id = '00000000-0000-0000-0000-000000000703' and lr.start_date = current_date + 7);

insert into leave_requests (org_id, employee_id, leave_type_id, start_date, end_date, unit, total_days, reason, status)
select '00000000-0000-0000-0000-000000000001', id, '00000000-0000-0000-0000-000000000702', current_date - 7, current_date - 7, 'full_day', 1, 'ธุระส่วนตัว', 'approved'
from employees e
where e.employee_code = 'EMP-009' and e.org_id = '00000000-0000-0000-0000-000000000001'
  and not exists (select 1 from leave_requests lr where lr.employee_id = e.id and lr.leave_type_id = '00000000-0000-0000-0000-000000000702' and lr.start_date = current_date - 7);

-- Overtime: one pending (needs Manager approval), one already approved from a few days ago.
insert into overtime_requests (org_id, employee_id, work_date, start_time, end_time, requested_hours, rate_multiplier, reason, status)
select '00000000-0000-0000-0000-000000000001', id, current_date - 1, '17:30', '19:30', 2, 1.5, 'ปิดยอดขายสิ้นเดือน', 'pending'
from employees e
where e.employee_code = 'EMP-003' and e.org_id = '00000000-0000-0000-0000-000000000001'
  and not exists (select 1 from overtime_requests ot where ot.employee_id = e.id and ot.work_date = current_date - 1);

insert into overtime_requests (org_id, employee_id, work_date, start_time, end_time, requested_hours, approved_hours, rate_multiplier, reason, status)
select '00000000-0000-0000-0000-000000000001', id, current_date - 3, '17:30', '20:30', 3, 3, 1.5, 'ตรวจนับสต๊อกสินค้า', 'approved'
from employees e
where e.employee_code = 'EMP-010' and e.org_id = '00000000-0000-0000-0000-000000000001'
  and not exists (select 1 from overtime_requests ot where ot.employee_id = e.id and ot.work_date = current_date - 3);

-- Announcements shown on the admin dashboard and employee home screen.
insert into announcements (org_id, title, body, target_type, publish_at, status)
select '00000000-0000-0000-0000-000000000001', v.title, v.body, 'all', v.publish_at, 'published'
from (
  values
    ('การปรับเวลาเข้างานช่วงเทศกาลปีใหม่', 'บริษัทฯ ขอแจ้งปรับเวลาเข้างานในช่วงเทศกาลปีใหม่ กรุณาตรวจสอบตารางงานของท่านในแอป', now() - interval '3 days'),
    ('แนวทางปฏิบัติเรื่องการทำงานทางไกล (Work From Home)', 'สรุปแนวทางและเงื่อนไขการขอทำงานทางไกลสำหรับพนักงานทุกแผนก', now() - interval '10 days'),
    ('สรุปสวัสดิการพนักงานใหม่ประจำปี', 'รายละเอียดสวัสดิการที่ปรับปรุงใหม่ มีผลตั้งแต่ต้นปีเป็นต้นไป', now() - interval '20 days')
) as v(title, body, publish_at)
where not exists (select 1 from announcements a where a.org_id = '00000000-0000-0000-0000-000000000001' and a.title = v.title);
