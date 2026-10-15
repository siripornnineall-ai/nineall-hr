-- Regular days off are put on the Attendance page ahead of time (owner 2026-10-15): everyone's
-- scheduled day off for the whole month (and the next one) already shows as หยุดประจำ, not
-- just the days that have already passed. Anyone who swaps a day off is handled by the swap
-- approval, which removes the placeholder on the day they now work.
--
-- Changes to 0106's function:
--   * day_off rows are written up to 62 days ahead; public-holiday rows still only up to today
--   * a future day_off placeholder (no clock-in) whose schedule has since become a working day
--     is removed, so editing the weekly schedule does not leave stale days off behind
--   * the nightly job covers the rest of this month and all of next month

create or replace function public.sync_scheduled_days_off_attendance(p_from date, p_to date, p_employee_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_to date := least(p_to, v_today + 62);
  v_prev_trusted text;
  v_n integer := 0;
begin
  if auth.uid() is not null and not coalesce(is_admin_or_hr(), false) then
    return 0;
  end if;
  if p_from is null or v_to < p_from then
    return 0;
  end if;

  v_prev_trusted := current_setting('app.trusted_attendance_write', true);
  perform set_config('app.trusted_attendance_write', 'true', true);

  -- Future placeholders the schedule no longer supports.
  delete from attendance_records a
   where a.work_date > v_today and a.work_date between p_from and v_to
     and a.status = 'day_off' and a.clock_in_server_at is null
     and (p_employee_id is null or a.employee_id = p_employee_id)
     and exists (select 1 from shift_assignments s where s.employee_id = a.employee_id and s.work_date = a.work_date and not s.is_day_off)
     and not exists (select 1 from shift_assignments s where s.employee_id = a.employee_id and s.work_date = a.work_date and s.is_day_off);

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
             when c.work_date <= v_today and exists (select 1 from company_holidays h where h.org_id = c.org_id and h.holiday_date = c.work_date)
               then 'holiday'::attendance_status
             else 'day_off'::attendance_status
           end as status
    from candidates c
    where not exists (select 1 from attendance_records a where a.employee_id = c.employee_id and a.work_date = c.work_date)
      and (
        (c.work_date <= v_today
          and exists (select 1 from company_holidays h where h.org_id = c.org_id and h.holiday_date = c.work_date)
          and not exists (select 1 from holiday_swap_requests r where r.employee_id = c.employee_id and r.holiday_date = c.work_date and r.status = 'approved'))
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

-- Fill the rest of this month and next month now.
select public.sync_scheduled_days_off_attendance(
  date_trunc('month', (now() at time zone 'Asia/Bangkok')::date)::date,
  (date_trunc('month', (now() at time zone 'Asia/Bangkok')::date) + interval '2 months - 1 day')::date
);

select cron.unschedule('sync-scheduled-days-off-attendance');
select cron.schedule(
  'sync-scheduled-days-off-attendance',
  '10 17 * * *',
  $$select public.sync_scheduled_days_off_attendance(
      ((now() at time zone 'Asia/Bangkok')::date - 7),
      (date_trunc('month', (now() at time zone 'Asia/Bangkok')::date) + interval '2 months - 1 day')::date
    );$$
);
