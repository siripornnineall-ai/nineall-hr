-- Read-only org chart for employee-pwa: same whitelisted-lookup pattern as
-- get_employee_basic_info / get_output_team_roster / get_todays_birthdays, since regular
-- employees_select RLS only allows seeing your own row (or your direct reports') — the
-- org chart needs every active employee's name/position/department/manager to render the
-- whole company tree, nothing more sensitive than that.
create or replace function get_org_chart_nodes()
returns table (
  employee_id uuid,
  first_name text,
  last_name text,
  photo_url text,
  position_title text,
  department_name text,
  manager_employee_id uuid
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.id, e.first_name, e.last_name, e.photo_url, jp.title, d.name, e.manager_employee_id
  from employees e
  left join job_positions jp on jp.id = e.job_position_id
  left join departments d on d.id = e.department_id
  where e.org_id = current_org_id()
    and e.deleted_at is null
    and e.employment_status in ('active', 'probation');
$$;
revoke all on function get_org_chart_nodes() from public;
grant execute on function get_org_chart_nodes() to authenticated;
