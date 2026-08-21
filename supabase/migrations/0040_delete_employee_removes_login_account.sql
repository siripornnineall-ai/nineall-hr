-- Fix: deleting an employee (delete_employee, 0036) only soft-deleted the employees row
-- and deactivated the profile, but never removed the underlying auth.users/auth.identities
-- row — so that email stayed permanently "taken" and blocked creating a fresh login
-- account for a re-added employee with the same email (confirmed: EMAIL_ALREADY_USED).
-- Since deletion means "this person never really worked here", there's no reason to keep
-- a dangling auth account around — remove it outright. Falls back to just deactivating
-- the profile if the hard delete hits a foreign-key reference elsewhere (e.g. this
-- profile is already referenced in an audit log), so that failure never rolls back the
-- employee soft-delete itself.

create or replace function public.delete_employee(
  p_employee_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_profile_id uuid;
begin
  if not is_admin_or_hr() then
    raise exception 'FORBIDDEN: only super_admin/hr can delete an employee';
  end if;

  update employees
  set deleted_at = now(), updated_by = current_employee_id()
  where id = p_employee_id and org_id = current_org_id();

  select id into v_profile_id from profiles where employee_id = p_employee_id and org_id = current_org_id();

  if v_profile_id is not null then
    begin
      delete from auth.identities where user_id = v_profile_id;
      delete from public.profiles where id = v_profile_id;
      delete from auth.users where id = v_profile_id;
    exception when others then
      update public.profiles set is_active = false where id = v_profile_id;
    end;
  end if;

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
