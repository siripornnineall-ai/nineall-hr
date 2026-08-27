-- Employees could submit (or edit a still-pending) OT request for any work_date, with no
-- limit on how far in the past — HR wants backdating capped at 3 days so OT can't show up
-- for long-past dates. Enforced in RLS (not just the client) since employees insert
-- overtime_requests directly, not through a server action.
drop policy if exists overtime_requests_insert on overtime_requests;
create policy overtime_requests_insert on overtime_requests for insert
  with check (
    org_id = current_org_id()
    and is_self(employee_id)
    and status = 'pending'
    and work_date >= ((now() at time zone 'Asia/Bangkok')::date - 3)
  );

drop policy if exists overtime_requests_update_owner on overtime_requests;
create policy overtime_requests_update_owner on overtime_requests for update
  using (org_id = current_org_id() and is_self(employee_id) and status = 'pending')
  with check (
    org_id = current_org_id()
    and is_self(employee_id)
    and work_date >= ((now() at time zone 'Asia/Bangkok')::date - 3)
  );
