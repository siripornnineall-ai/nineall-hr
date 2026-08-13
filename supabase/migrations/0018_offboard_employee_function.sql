-- Offboard an employee (mark resigned/terminated) via a security-definer function, so this
-- HR-only action does not need the Supabase service-role key at all.
--
-- Why not just use the regular authenticated client: 0017 restricted `authenticated`'s
-- table-level UPDATE grant on `employees` to a narrow self-edit column list, to close a real
-- gap where any employee could otherwise update *any* column on their own row (not just
-- name/photo/bio) via a direct API call. But Postgres column GRANTs apply to the database
-- role, and every Supabase Auth user — employee or super_admin alike — maps to the same
-- `authenticated` role, so that restriction also blocked legitimate HR/admin updates to
-- employment_status. RLS's `employees_write_admin_hr` policy (is_admin_or_hr()) would have
-- allowed this at the row level, but column grants can't express "only if you're also HR" —
-- they're coarser than RLS. A `security definer` function sidesteps the whole problem: it
-- runs with the function owner's privileges (bypassing the column grant and RLS), while the
-- is_admin_or_hr() check inside the function body enforces the real authorization.

create or replace function public.offboard_employee(
  p_employee_id uuid,
  p_status text,
  p_effective_date date,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_admin_or_hr() then
    raise exception 'FORBIDDEN: only super_admin/hr can offboard an employee';
  end if;
  if p_status not in ('resigned', 'terminated') then
    raise exception 'INVALID_STATUS: % is not a valid offboarding status', p_status;
  end if;

  if p_status = 'resigned' then
    update employees
    set employment_status = 'resigned', resignation_date = p_effective_date, updated_by = current_employee_id()
    where id = p_employee_id and org_id = current_org_id();
  else
    update employees
    set employment_status = 'terminated', termination_date = p_effective_date, updated_by = current_employee_id()
    where id = p_employee_id and org_id = current_org_id();
  end if;

  update profiles
  set is_active = false
  where employee_id = p_employee_id and org_id = current_org_id();

  insert into audit_logs (org_id, actor_profile_id, action, entity_type, entity_id, reason)
  values (
    current_org_id(),
    (select id from profiles where id = auth.uid()),
    case when p_status = 'resigned' then 'employee.resign' else 'employee.terminate' end,
    'employees',
    p_employee_id,
    p_reason
  );
end;
$$;

revoke all on function public.offboard_employee(uuid, text, date, text) from public;
grant execute on function public.offboard_employee(uuid, text, date, text) to authenticated;
