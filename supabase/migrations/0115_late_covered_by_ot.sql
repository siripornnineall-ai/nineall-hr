-- Ice (90026) and Kanin (90031), owner 2026-10-26: lateness is shown as "on time" only when
-- there is OT to deduct it from. With no OT to take it from, the day shows "late" as usual.
--
-- late_covered_dates() returns the late days (in the range) whose minutes are fully covered by the
-- employee's approved OT in the same OT window, taking late days in date order against the OT
-- minutes of that window. OT window = the 26th-25th cycle, or the calendar month for staff with
-- ot_calendar_month; staff on the "deduct from the previous cycle" rule (late_deduct_from_prev_ot_since)
-- may also draw on the previous window's OT. Nothing here deducts anything: payroll and the OT
-- page do the real deduction; this only decides which label the Attendance screens show.
-- employees.hide_late_status now means "show covered late days as on time".

create or replace function public.late_covered_dates(p_employee_id uuid, p_from date, p_to date)
returns setof date
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_cal boolean;
  v_prev boolean;
begin
  if not (coalesce(is_admin_or_hr(), false) or p_employee_id = current_employee_id()) then
    return;
  end if;

  select ot_calendar_month, late_deduct_from_prev_ot_since is not null
    into v_cal, v_prev
    from employees where id = p_employee_id;
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
     and c.cum_m <= coalesce((select mins from ot where ot.win = c.win), 0)
                  + case when v_prev then coalesce((select mins from ot where ot.win = c.win - interval '1 month'), 0) else 0 end;
end;
$$;

revoke all on function public.late_covered_dates(uuid, date, date) from public;
grant execute on function public.late_covered_dates(uuid, date, date) to authenticated;

-- Ice is back on the rule (it had been switched off while her OT was not yet deducted).
update employees set hide_late_status = true where employee_code = '90026' and deleted_at is null;
