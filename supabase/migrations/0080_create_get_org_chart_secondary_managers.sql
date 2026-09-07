-- Read-only RPC so employee-pwa's org-chart (RLS-limited to self/admin/manager-of via
-- employees_select) can also show secondary-manager dashed lines, matching get_org_chart_nodes.
create or replace function public.get_org_chart_secondary_managers()
returns table (
  employee_id uuid,
  manager_employee_id uuid
)
language sql
security definer
set search_path = public
as $$
  select m.employee_id, m.manager_employee_id
  from employee_secondary_managers m
  join employees e on e.id = m.employee_id and e.deleted_at is null
  where m.org_id = current_org_id();
$$;

revoke all on function public.get_org_chart_secondary_managers() from public;
grant execute on function public.get_org_chart_secondary_managers() to authenticated;
