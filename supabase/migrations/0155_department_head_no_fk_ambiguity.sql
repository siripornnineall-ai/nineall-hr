-- departments.head_employee_id (0152) added a SECOND foreign key between employees and departments, which makes every
-- PostgREST embed like employees?select=...,departments(name) ambiguous (HTTP 300) and broke the admin pages.
-- Keep the column but drop the FK; integrity is kept by triggers instead. (Applied to production 2026-11-16.)
alter table public.departments drop constraint if exists departments_head_employee_id_fkey;

create or replace function public.clear_department_head_on_employee_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update departments set head_employee_id = null where head_employee_id = old.id;
  return old;
end;
$$;
drop trigger if exists trg_employees_clear_dept_head on public.employees;
create trigger trg_employees_clear_dept_head before delete on public.employees
  for each row execute function public.clear_department_head_on_employee_delete();

create or replace function public.check_department_head_exists()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.head_employee_id is not null and not exists (select 1 from employees where id = new.head_employee_id and org_id = new.org_id) then
    raise exception 'ไม่พบพนักงานที่เลือกเป็นหัวหน้าแผนก';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_departments_check_head on public.departments;
create trigger trg_departments_check_head before insert or update of head_employee_id on public.departments
  for each row execute function public.check_department_head_exists();
