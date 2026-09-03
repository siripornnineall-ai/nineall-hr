-- output_team_members already has an org-scoped SELECT policy, but its embed of
-- employees(first_name, last_name) silently returns null for teammates because the base
-- employees_select RLS only allows admin/HR/self/direct-manager — the same gap
-- get_employee_basic_info (migration 0055) solves for the colleague directory. This does the
-- same for team rosters: any org member can see teammates' names, but nothing else on
-- the employees row.
create or replace function get_output_team_roster(p_output_team_id uuid)
returns table (member_id uuid, employee_id uuid, is_lead boolean, managed_pages text[], first_name text, last_name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select m.id, m.employee_id, m.is_lead, m.managed_pages, e.first_name, e.last_name
  from output_team_members m
  join employees e on e.id = m.employee_id
  join output_teams t on t.id = m.output_team_id
  where m.output_team_id = p_output_team_id
    and t.org_id = current_org_id()
  order by m.is_lead desc, e.first_name;
$$;
revoke all on function get_output_team_roster(uuid) from public;
grant execute on function get_output_team_roster(uuid) to authenticated;
