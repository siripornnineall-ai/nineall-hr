-- "new row violates row-level security policy for table overtime_requests" (owner 2026-11-12).
--
-- Cause: the admin / HR insert policy had the same "work_date within the last 3 days" cap as the employee one
-- (migration 0056), so the admin screen "บันทึก OT ย้อนหลังให้พนักงาน" (made for OT the employee forgot to request)
-- failed for any date older than 3 days, with the raw database message.
--
-- 1. Admin / HR insert: no date cap any more, but now the employee must belong to the same company as the row
--    (before, org_id was only compared with the caller's company, not with the employee's).
-- 2. Employee update of an own pending request: it can no longer set status / approved_hours itself. Before, the
--    WITH CHECK did not look at status, so an employee could mark their own request "approved" with a direct call.
-- Employees keep: insert only for themselves, status 'pending', work_date within the last 3 days. RLS stays on.

alter policy overtime_requests_insert_admin_hr on public.overtime_requests
  with check (
    org_id = (select current_org_id())
    and (select is_admin_or_hr())
    and exists (select 1 from public.employees e where e.id = employee_id and e.org_id = overtime_requests.org_id)
  );

alter policy overtime_requests_update_owner on public.overtime_requests
  using (org_id = (select current_org_id()) and is_self(employee_id) and status = 'pending')
  with check (
    org_id = (select current_org_id())
    and is_self(employee_id)
    and status = 'pending'
    and approved_hours is null
    and work_date >= ((now() at time zone 'Asia/Bangkok')::date - 3)
  );
