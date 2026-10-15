-- Days off and public holidays only got an attendance row when somebody happened to open that
-- exact date on the Attendance page (syncDayOffAttendance / syncHolidayAttendance in admin-web
-- ran per viewed date). The per-employee monthly page never ran them, so a weekend day off set
-- in the shift schedule showed as a gap (reported 2026-10-15; 33 missing rows were found).
--
-- This function writes the missing rows for a date range, from the schedule itself:
--   * a company holiday  -> 'holiday' for everyone who has no record that day and no approved
--     holiday swap for it. Owner rule (2026-10-15): on a public holiday, whoever did not clock in
--     is simply off for the holiday; whoever clocked in swapped it for another day. The shift
--     schedule is not consulted, because a 7-day work schedule would otherwise hide the holiday.
--   * a scheduled day off -> 'day_off'
-- Never overwrites an existing row, never touches today's or past-hire dates, and is safe to
-- run repeatedly. pg_cron runs it every night; the monthly page also calls it for its month.

create or replace function public.sync_scheduled_days_off_attendance(p_from date, p_to date, p_employee_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_to date := least(p_to, v_today);
  v_prev_trusted text;
  v_n integer := 0;
begin
  -- Cron has no session (auth.uid() is null); an app caller must be HR / admin.
  if auth.uid() is not null and not coalesce(is_admin_or_hr(), false) then
    return 0;
  end if;
  if p_from is null or v_to < p_from then
    return 0;
  end if;

  v_prev_trusted := current_setting('app.trusted_attendance_write', true);
  perform set_config('app.trusted_attendance_write', 'true', true);

  with candidates as (
    select e.org_id, e.id as employee_id, d::date as work_date
    from employees e
    cross join generate_series(p_from, v_to, interval '1 day') d
    where e.deleted_at is null
      and e.employment_status in ('active', 'probation')
      and e.hire_date <= d::date
      and (p_employee_id is null or e.id = p_employee_id)
  ), marked as (
    select c.org_id, c.employee_id, c.work_date,
           case
             when exists (select 1 from company_holidays h where h.org_id = c.org_id and h.holiday_date = c.work_date)
               then 'holiday'::attendance_status
             else 'day_off'::attendance_status
           end as status
    from candidates c
    where not exists (select 1 from attendance_records a where a.employee_id = c.employee_id and a.work_date = c.work_date)
      and (
        exists (select 1 from company_holidays h where h.org_id = c.org_id and h.holiday_date = c.work_date)
          and not exists (select 1 from holiday_swap_requests r where r.employee_id = c.employee_id and r.holiday_date = c.work_date and r.status = 'approved')
        or exists (select 1 from shift_assignments s where s.employee_id = c.employee_id and s.work_date = c.work_date and s.is_day_off)
      )
  ), ins as (
    insert into attendance_records (org_id, employee_id, work_date, status, late_minutes, early_leave_minutes, worked_minutes, needs_review)
    select org_id, employee_id, work_date, status, 0, 0, 0, false from marked
    on conflict (employee_id, work_date) do nothing
    returning 1
  )
  select count(*) into v_n from ins;

  perform set_config('app.trusted_attendance_write', coalesce(v_prev_trusted, ''), true);
  return v_n;
end;
$$;

revoke all on function public.sync_scheduled_days_off_attendance(date, date, uuid) from public;
grant execute on function public.sync_scheduled_days_off_attendance(date, date, uuid) to authenticated;

-- Fill the gap that exists today, then keep it filled every night (00:10 Bangkok).
select public.sync_scheduled_days_off_attendance(date '2026-08-01', (now() at time zone 'Asia/Bangkok')::date);

select cron.schedule(
  'sync-scheduled-days-off-attendance',
  '10 17 * * *',
  $$select public.sync_scheduled_days_off_attendance(((now() at time zone 'Asia/Bangkok')::date - 7), (now() at time zone 'Asia/Bangkok')::date);$$
);
