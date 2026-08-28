-- The engagement features (late/cookie leaderboards, colleague directory, profiles)
-- show any employee's name + photo to any other org member — broader than the existing
-- avatars_read policy (admin/HR, self, or direct manager only). Storage RLS policies for
-- the same command are OR'd together, so this ADDS an org-wide read path for the
-- 'avatars' bucket specifically, leaving selfies/documents/payslips/attachments/
-- announcements untouched.
create policy avatars_read_org_wide on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and storage_path_org_id(name) = current_org_id());

-- Minimal whitelisted identity fields for any org member to look up any colleague by id —
-- used by the leaderboard click-through detail pages and the colleague directory/profile
-- pages, without granting the broader employees_select RLS (which still restricts full-row
-- access to admin/HR/self/manager since the employees table carries sensitive PII).
create or replace function get_employee_basic_info(p_employee_id uuid)
returns table (employee_id uuid, employee_code text, first_name text, last_name text, nickname text, photo_url text, job_title text, intro_bio text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url, jp.title, e.intro_bio
  from employees e
  left join job_positions jp on jp.id = e.job_position_id
  where e.id = p_employee_id
    and e.org_id = current_org_id()
    and e.deleted_at is null;
$$;
revoke all on function get_employee_basic_info(uuid) from public;
grant execute on function get_employee_basic_info(uuid) to authenticated;
