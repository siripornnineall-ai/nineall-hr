-- Whitelisted lookup (same reasoning as get_employee_basic_info / get_output_team_roster)
-- so the birthday banner can show every org member's birthday today without granting
-- broader employees_select RLS access.
create or replace function get_todays_birthdays()
returns table (employee_id uuid, first_name text, last_name text, nickname text, photo_url text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.id, e.first_name, e.last_name, e.nickname, e.photo_url
  from employees e
  where e.org_id = current_org_id()
    and e.deleted_at is null
    and e.employment_status in ('active', 'probation')
    and e.date_of_birth is not null
    and extract(month from e.date_of_birth) = extract(month from (now() at time zone 'Asia/Bangkok'))
    and extract(day from e.date_of_birth) = extract(day from (now() at time zone 'Asia/Bangkok'));
$$;
revoke all on function get_todays_birthdays() from public;
grant execute on function get_todays_birthdays() to authenticated;
