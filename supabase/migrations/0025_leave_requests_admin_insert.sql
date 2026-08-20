-- Nineall HR — let HR/super_admin insert a leave_requests row on behalf of any employee
-- in their org (0009's leave_requests_insert policy only ever allowed is_self(employee_id),
-- since until now only the employee-pwa self-submit flow ever inserted a row). Needed for
-- the new "record a backdated leave" admin feature, which inserts as status='pending' then
-- immediately updates to 'approved' via the existing leave_requests_decide policy.

create policy leave_requests_insert_admin on leave_requests for insert
  with check (org_id = current_org_id() and is_admin_or_hr());
