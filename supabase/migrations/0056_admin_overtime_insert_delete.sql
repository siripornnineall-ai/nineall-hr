-- Admin/HR previously had no way to insert an OT record on an employee's behalf (only the
-- employee's own self-service insert existed) and no way to delete one at all (the delete
-- button in admin-web already called overtime_requests.delete(), but with no DELETE policy
-- RLS silently filtered every row out — no error, zero rows affected, looked like the button
-- did nothing). Mirrors the employee-side 3-day backdating cap from migration 0049 onto this
-- new admin insert path too.
create policy overtime_requests_insert_admin_hr on overtime_requests for insert
  with check (org_id = current_org_id() and is_admin_or_hr() and work_date >= ((now() at time zone 'Asia/Bangkok')::date - 3));

create policy overtime_requests_delete_admin_hr on overtime_requests for delete
  using (org_id = current_org_id() and is_admin_or_hr());
