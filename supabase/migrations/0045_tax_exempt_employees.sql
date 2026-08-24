-- Nineall HR — some employees (owner/family management here) handle their own
-- personal income tax outside payroll withholding and should never have withholding
-- tax deducted through this system, regardless of salary. Low earners already get
-- zero tax naturally from the progressive bracket calculation (the first bracket is
-- 0% up to 150,000 THB/year, ~12,500/month) — this flag is only for the specific
-- override case, not a replacement for that.

alter table employees add column if not exists tax_exempt boolean not null default false;

update employees
set tax_exempt = true
where id in (
  '02a658d3-241e-4167-b48d-f223711bec4a', -- จิรนันท์ ทรัพย์ศรีโสภา (90016)
  'b5e3c26c-8893-4667-a425-094e8c407eb2', -- จิรานุช ทรัพย์ศรีโสภา (90019)
  'acbf9fa4-1f41-4b7c-953a-21a75b2421f0'  -- จิรพงศ์ ทรัพย์ศรีโสภา (90012)
);

create or replace function public.restrict_employee_self_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if is_admin_or_hr() then
    return new;
  end if;

  if new.org_id is distinct from old.org_id
    or new.employee_code is distinct from old.employee_code
    or new.first_name is distinct from old.first_name
    or new.last_name is distinct from old.last_name
    or new.branch_id is distinct from old.branch_id
    or new.department_id is distinct from old.department_id
    or new.team_id is distinct from old.team_id
    or new.job_position_id is distinct from old.job_position_id
    or new.manager_employee_id is distinct from old.manager_employee_id
    or new.employment_type is distinct from old.employment_type
    or new.employment_status is distinct from old.employment_status
    or new.hire_date is distinct from old.hire_date
    or new.probation_end_date is distinct from old.probation_end_date
    or new.resignation_date is distinct from old.resignation_date
    or new.termination_date is distinct from old.termination_date
    or new.tax_id is distinct from old.tax_id
    or new.social_security_id is distinct from old.social_security_id
    or new.created_by is distinct from old.created_by
    or new.deleted_at is distinct from old.deleted_at
    or new.attendance_exempt is distinct from old.attendance_exempt
    or new.tax_exempt is distinct from old.tax_exempt
  then
    raise exception 'Employees may only self-edit personal contact fields (nickname, photo, date of birth, gender, phone, email, address). Work/employment fields require HR.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
