-- Nineall HR — RLS helper functions
-- security definer + fixed search_path so these can safely read `profiles`
-- (which itself has RLS) from inside other tables' policies without recursion.

create or replace function current_org_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid();
$$;

create or replace function current_user_role()
returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function current_employee_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select employee_id from profiles where id = auth.uid();
$$;

create or replace function is_admin_or_hr()
returns boolean
language sql stable security definer set search_path = public as $$
  select current_user_role() in ('super_admin', 'hr');
$$;

-- True when `target_employee_id` is on the caller's team, or directly reports to the caller.
create or replace function is_manager_of(target_employee_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from employees e
    left join teams t on t.id = e.team_id
    where e.id = target_employee_id
      and current_user_role() = 'manager'
      and (e.manager_employee_id = current_employee_id() or t.manager_employee_id = current_employee_id())
  );
$$;

create or replace function is_self(target_employee_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select target_employee_id = current_employee_id();
$$;
