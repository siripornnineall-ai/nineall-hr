-- Nineall HR — soft-delete an employee (for mistaken/duplicate entries that never
-- actually worked here), distinct from offboard_employee (resigned/terminated), which
-- is for real past employees and keeps them visible in history/reports.
--
-- Also switches the (org_id, employee_code) unique index to a partial index that only
-- applies to non-deleted rows, so a deleted employee's code can immediately be reused —
-- this was the actual blocker reported ("add a new one and it won't let me, but I can't
-- delete the old one either"): soft-delete alone hides the row from lists, but the old
-- full unique index still reserved its employee_code forever.

alter table employees drop constraint if exists employees_org_id_employee_code_key;
create unique index if not exists employees_org_id_employee_code_key on employees(org_id, employee_code) where deleted_at is null;

create or replace function public.delete_employee(
  p_employee_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_admin_or_hr() then
    raise exception 'FORBIDDEN: only super_admin/hr can delete an employee';
  end if;

  update employees
  set deleted_at = now(), updated_by = current_employee_id()
  where id = p_employee_id and org_id = current_org_id();

  update profiles
  set is_active = false
  where employee_id = p_employee_id and org_id = current_org_id();

  insert into audit_logs (org_id, actor_profile_id, action, entity_type, entity_id, reason)
  values (
    current_org_id(),
    (select id from profiles where id = auth.uid()),
    'employee.delete',
    'employees',
    p_employee_id,
    p_reason
  );
end;
$$;

revoke all on function public.delete_employee(uuid, text) from public;
grant execute on function public.delete_employee(uuid, text) to authenticated;
