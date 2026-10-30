-- Staff whose lateness is taken off their OT every month (owner 2026-10-30: Nan). Payroll already deducts every
-- late minute still standing after the same-day make-up from the OT of the 26th-25th cycle, so the screens must
-- not show those days as late. employees.late_deducted_from_ot marks such people: for them every late day counts
-- as covered and its source is "OT" (source_date is null), instead of drawing on the after-shift spare time pool
-- (which only matters for HR/Content, whose OT is unpaid). Display only; payroll is unchanged.

alter table public.employees add column if not exists late_deducted_from_ot boolean not null default false;

update public.employees set late_deducted_from_ot = true where id = '1838658a-5eec-434d-920c-d87a9bf137f9' and employee_code = '90033';

alter function public._late_cover_allocations(uuid, date, date) rename to _late_cover_allocations_pool;

create or replace function public._late_cover_allocations(p_employee_id uuid, p_from date, p_to date)
returns table(late_date date, source_date date, minutes_used integer, is_wfh boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from employees e where e.id = p_employee_id and e.late_deducted_from_ot) then
    return query
      select a.work_date, null::date, a.late_minutes, false
        from attendance_records a
       where a.employee_id = p_employee_id and a.status = 'late' and a.late_minutes > 0
         and a.work_date between p_from and p_to
       order by a.work_date;
    return;
  end if;
  return query select * from public._late_cover_allocations_pool(p_employee_id, p_from, p_to);
end;
$$;

revoke all on function public._late_cover_allocations(uuid, date, date) from public;
revoke all on function public._late_cover_allocations_pool(uuid, date, date) from public;
