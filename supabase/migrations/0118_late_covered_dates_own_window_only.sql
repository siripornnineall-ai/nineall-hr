-- late_covered_dates() (0115) also let staff on the "previous cycle" rule draw on the previous window's OT.
-- That double-counted OT already used by the previous window's own lateness (Kom-kaem's and Ice's
-- October lateness showed as covered by September OT that the September run consumes). Coverage now uses
-- only the OT of the same window, which is what the Attendance label should reflect. Payroll's real
-- deduction (lateDeduction.ts) is unchanged. Function body: see migration 0115 minus the v_prev term.
create or replace function public.late_covered_dates(p_employee_id uuid, p_from date, p_to date)
returns setof date
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_cal boolean;
begin
  if not (coalesce(is_admin_or_hr(), false) or p_employee_id = current_employee_id()) then
    return;
  end if;

  select ot_calendar_month into v_cal from employees where id = p_employee_id;
  if v_cal is null then
    return;
  end if;

  return query
  with late as (
    select a.work_date as d, a.late_minutes as m,
           case
             when v_cal then date_trunc('month', a.work_date)
             when extract(day from a.work_date) >= 26 then date_trunc('month', a.work_date) + interval '1 month'
             else date_trunc('month', a.work_date)
           end as win
      from attendance_records a
     where a.employee_id = p_employee_id and a.status = 'late' and a.late_minutes > 0
       and a.work_date between p_from - 45 and p_to
  ), ot as (
    select case
             when v_cal then date_trunc('month', o.work_date)
             when extract(day from o.work_date) >= 26 then date_trunc('month', o.work_date) + interval '1 month'
             else date_trunc('month', o.work_date)
           end as win,
           sum(coalesce(o.approved_hours, o.requested_hours) * 60) as mins
      from overtime_requests o
     where o.employee_id = p_employee_id and o.status = 'approved'
       and o.work_date between p_from - 80 and p_to + 31
     group by 1
  ), cum as (
    select l.d, l.win, sum(l.m) over (partition by l.win order by l.d) as cum_m from late l
  )
  select c.d::date
    from cum c
   where c.d between p_from and p_to
     and c.cum_m <= coalesce((select mins from ot where ot.win = c.win), 0);
end;
$$;
