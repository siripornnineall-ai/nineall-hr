-- employees.bio already exists (migration 0017, self-editable "introduce yourself" field
-- already used on the employee-pwa profile page) — migration 0053's intro_bio column was
-- a duplicate of it, added by mistake before this file's author noticed. Drop it and point
-- get_employee_basic_info at the real column instead. The function's return shape is
-- changing (intro_bio -> bio), which Postgres treats as a different row type, so the old
-- definition has to be dropped before it can be recreated.
drop function if exists get_employee_basic_info(uuid);

alter table employees drop column if exists intro_bio;

create or replace function get_employee_basic_info(p_employee_id uuid)
returns table (employee_id uuid, employee_code text, first_name text, last_name text, nickname text, photo_url text, job_title text, bio text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url, jp.title, e.bio
  from employees e
  left join job_positions jp on jp.id = e.job_position_id
  where e.id = p_employee_id
    and e.org_id = current_org_id()
    and e.deleted_at is null;
$$;
revoke all on function get_employee_basic_info(uuid) from public;
grant execute on function get_employee_basic_info(uuid) to authenticated;

-- Batched version of the above — resolving names/photos for a set of comment/reaction
-- authors one RPC call at a time would be a round-trip per person.
create or replace function get_employees_basic_info(p_employee_ids uuid[])
returns table (employee_id uuid, employee_code text, first_name text, last_name text, nickname text, photo_url text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url
  from employees e
  where e.id = any(p_employee_ids)
    and e.org_id = current_org_id()
    and e.deleted_at is null;
$$;
revoke all on function get_employees_basic_info(uuid[]) from public;
grant execute on function get_employees_basic_info(uuid[]) to authenticated;

-- The colleague directory — every active employee in the org, whitelisted columns only
-- (mirrors get_employee_basic_info's scope, not the full employees row).
create or replace function get_colleague_directory()
returns table (employee_id uuid, employee_code text, first_name text, last_name text, nickname text, photo_url text, job_title text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url, jp.title
  from employees e
  left join job_positions jp on jp.id = e.job_position_id
  where e.org_id = current_org_id()
    and e.deleted_at is null
    and e.employment_status in ('active', 'probation')
  order by e.first_name;
$$;
revoke all on function get_colleague_directory() from public;
grant execute on function get_colleague_directory() to authenticated;

-- How many cookies the calling employee has given out this calendar month — lets the
-- give-a-cookie UI show remaining allowance and disable itself at the 5/month cap
-- (migration 0053's trigger is the actual enforcement; this is just for display).
create or replace function get_my_cookie_balance()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select 5 - count(*)::integer
  from kindness_cookies
  where giver_employee_id = current_employee_id()
    and month = date_trunc('month', (now() at time zone 'Asia/Bangkok'))::date;
$$;
revoke all on function get_my_cookie_balance() from public;
grant execute on function get_my_cookie_balance() to authenticated;
