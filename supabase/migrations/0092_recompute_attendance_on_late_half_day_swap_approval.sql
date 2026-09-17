-- A half-day swap approved AFTER the employee already clocked in/out left the attendance
-- record judged against the full shift.
--
-- Real case (2026-09-16): an employee with a morning half-day off clocked in at 12:30; HR
-- approved the swap at 12:36. clock_in() only skips the late check when the swap is already
-- approved at that moment, so she was marked 189 minutes late for a morning she had off.
-- The same hole exists at clock-out for an afternoon half-day off (early_leave).
--
-- Fix: when a half-day day-off swap or holiday swap becomes approved, re-judge any
-- attendance record that already exists on the substitute date, mirroring what
-- clock_in()/clock_out() would have done had the approval come first:
--   morning off   -> 'late' becomes 'on_time', late_minutes 0
--   afternoon off -> 'early_leave' becomes 'on_time', early_leave_minutes 0
-- The status change fires trg_auto_overtime_update, so auto-OT is recomputed too.

create or replace function public.rejudge_attendance_on_half_day_swap_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_trusted text;
begin
  if new.status <> 'approved' or new.unit <> 'half_day' or new.period is null or new.substitute_date is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved'
     and old.period is not distinct from new.period
     and old.substitute_date is not distinct from new.substitute_date then
    return new;
  end if;

  -- The approver may be a manager (not HR), and restrict_attendance_self_update() only lets
  -- HR or a flagged trusted write touch these columns.
  v_prev_trusted := current_setting('app.trusted_attendance_write', true);
  perform set_config('app.trusted_attendance_write', 'true', true);

  if new.period = 'morning' then
    update attendance_records
      set status = 'on_time', late_minutes = 0
      where employee_id = new.employee_id and work_date = new.substitute_date and status = 'late';
  elsif new.period = 'afternoon' then
    update attendance_records
      set status = 'on_time', early_leave_minutes = 0
      where employee_id = new.employee_id and work_date = new.substitute_date and status = 'early_leave';
  end if;

  perform set_config('app.trusted_attendance_write', coalesce(v_prev_trusted, ''), true);
  return new;
end;
$$;

drop trigger if exists trg_rejudge_attendance_day_off_swap on day_off_swap_requests;
create trigger trg_rejudge_attendance_day_off_swap
  after insert or update of status, period, substitute_date on day_off_swap_requests
  for each row
  execute function rejudge_attendance_on_half_day_swap_approval();

drop trigger if exists trg_rejudge_attendance_holiday_swap on holiday_swap_requests;
create trigger trg_rejudge_attendance_holiday_swap
  after insert or update of status, period, substitute_date on holiday_swap_requests
  for each row
  execute function rejudge_attendance_on_half_day_swap_approval();

-- One-off repair of records already caught by this (includes the 2026-09-16 case).
select set_config('app.trusted_attendance_write', 'true', true);

update attendance_records a
  set status = 'on_time', late_minutes = 0
  where a.status = 'late'
    and exists (
      select 1 from day_off_swap_requests r
        where r.employee_id = a.employee_id and r.substitute_date = a.work_date
          and r.status = 'approved' and r.unit = 'half_day' and r.period = 'morning'
      union all
      select 1 from holiday_swap_requests r
        where r.employee_id = a.employee_id and r.substitute_date = a.work_date
          and r.status = 'approved' and r.unit = 'half_day' and r.period = 'morning'
    );

update attendance_records a
  set status = 'on_time', early_leave_minutes = 0
  where a.status = 'early_leave'
    and exists (
      select 1 from day_off_swap_requests r
        where r.employee_id = a.employee_id and r.substitute_date = a.work_date
          and r.status = 'approved' and r.unit = 'half_day' and r.period = 'afternoon'
      union all
      select 1 from holiday_swap_requests r
        where r.employee_id = a.employee_id and r.substitute_date = a.work_date
          and r.status = 'approved' and r.unit = 'half_day' and r.period = 'afternoon'
    );
