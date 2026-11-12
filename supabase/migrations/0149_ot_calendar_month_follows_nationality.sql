-- Lao and Burmese employees have their OT counted over the calendar month (1-30 / 1-31) instead of the 26th-25th cycle
-- (owner 2026-10-26, restated 2026-11-13). The flag is now also switched on automatically whenever an employee's
-- nationality is set to ลาว or เมียนมา, so new hires are not missed. It is never switched off automatically.
create or replace function public.ot_calendar_month_from_nationality()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.nationality in ('ลาว', 'เมียนมา') then
    new.ot_calendar_month := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employees_ot_calendar_month_nationality on public.employees;
create trigger trg_employees_ot_calendar_month_nationality
  before insert or update of nationality on public.employees
  for each row execute function public.ot_calendar_month_from_nationality();

update public.employees
   set ot_calendar_month = true
 where deleted_at is null and nationality in ('ลาว', 'เมียนมา') and ot_calendar_month is not true;
