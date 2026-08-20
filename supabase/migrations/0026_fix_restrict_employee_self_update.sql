-- Nineall HR — fix restrict_employee_self_update(), broken by 0023 dropping
-- national_id_masked/tax_id_masked/social_security_id_masked (this trigger, created
-- directly against the live DB earlier in the project and never captured in a migration
-- file until now, still referenced those column names — every non-admin employee
-- self-update, e.g. saving their own profile in employee-pwa, started failing with
-- "record \"new\" has no field \"national_id_masked\"" the moment those columns were
-- dropped). tax_id/social_security_id replace the old masked columns in the same
-- "employees can't self-edit this" bucket — they're admin-entered, view-only for the
-- employee (see profile/page.tsx). national_id was never in this restricted list (it's
-- self-editable) and stays that way.

create or replace function restrict_employee_self_update()
returns trigger
language plpgsql security definer set search_path = public as $$
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
  then
    raise exception 'Employees may only self-edit personal contact fields (nickname, photo, date of birth, gender, phone, email, address). Work/employment fields require HR.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
