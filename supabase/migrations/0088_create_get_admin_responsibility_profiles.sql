-- Read-only RPC so employee-pwa's admin-responsibilities page (any employee, not just
-- hr/manager) can see the profile owners' name/photo/title, same RLS-bypass pattern as
-- get_org_chart_nodes() / get_employee_basic_info() — employees_select RLS would otherwise
-- hide most of these employees from a regular staff viewer.
create or replace function public.get_admin_responsibility_profiles()
returns table (
  profile_id uuid,
  employee_id uuid,
  first_name text,
  last_name text,
  photo_url text,
  job_title text,
  shift_label text,
  duties text[]
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select p.id, p.employee_id, e.first_name, e.last_name, e.photo_url, jp.title, p.shift_label, p.duties
  from admin_responsibility_profiles p
  join employees e on e.id = p.employee_id
  left join job_positions jp on jp.id = e.job_position_id
  where p.org_id = current_org_id() and e.deleted_at is null;
$function$;

revoke all on function public.get_admin_responsibility_profiles() from public;
grant execute on function public.get_admin_responsibility_profiles() to authenticated;
