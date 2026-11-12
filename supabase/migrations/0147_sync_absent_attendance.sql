-- "ขาดงาน" was only ever written when HR opened the Attendance page for that exact past date (syncAbsentAttendance in the
-- admin app), so a scheduled workday nobody opened stayed blank on every other screen (monthly page, summary, reports,
-- payroll checks). Reported 2026-11-13. This adds the same marking as a nightly database job, like the day-off sync.
--
-- An employee gets an 'absent' row for a PAST date when all of these hold:
--   * the schedule has a working day for them that date (shift_assignments, not a day off, not WFH / off-site),
--   * no attendance row exists at all (no clock-in, no leave row, no day-off / holiday placeholder),
--   * no approved or pending leave covers the date,
--   * it is not a company holiday (unless they were swapped to work it),
--   * they are active / probation, hired by then, and not attendance_exempt.
-- Existing rows are never changed. No money is deducted by an 'absent' row (payroll has no absent penalty configured).

create or replace function public.sync_absent_attendance(p_from date, p_to date, p_employee_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_to date := least(p_to, v_today - 1);
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

  with ins as (
    insert into attendance_records (org_id, employee_id, work_date, shift_id, work_location_id, status, late_minutes, early_leave_minutes, worked_minutes, needs_review)
    select e.org_id, e.id, a.work_date, a.shift_id, a.work_location_id, 'absent'::attendance_status, 0, 0, 0, false
      from shift_assignments a
      join employees e on e.id = a.employee_id
     where a.work_date between p_from and v_to
       and a.is_day_off = false and a.shift_id is not null
       and coalesce(a.is_work_from_home, false) = false and coalesce(a.is_off_site, false) = false
       and e.deleted_at is null and e.employment_status in ('active', 'probation')
       and not coalesce(e.attendance_exempt, false)
       and e.hire_date <= a.work_date
       and (p_employee_id is null or e.id = p_employee_id)
       and not exists (select 1 from attendance_records r where r.employee_id = e.id and r.work_date = a.work_date)
       and not exists (select 1 from leave_requests l
                        where l.employee_id = e.id and a.work_date between l.start_date and l.end_date and l.status in ('approved', 'pending'))
       and not exists (select 1 from company_holidays h
                        where h.org_id = e.org_id and h.holiday_date = a.work_date
                          and not exists (select 1 from holiday_swap_requests s
                                           where s.employee_id = e.id and s.holiday_date = a.work_date and s.status = 'approved'))
    on conflict (employee_id, work_date) do nothing
    returning 1
  )
  select count(*) into v_n from ins;

  perform set_config('app.trusted_attendance_write', coalesce(v_prev_trusted, ''), true);
  return v_n;
end;
$function$;

revoke all on function public.sync_absent_attendance(date, date, uuid) from public;
grant execute on function public.sync_absent_attendance(date, date, uuid) to authenticated;

-- nightly at 00:25 Bangkok: yesterday and the 6 days before it
select cron.schedule(
  'sync-absent-attendance',
  '25 17 * * *',
  $job$select public.sync_absent_attendance(((now() at time zone 'Asia/Bangkok')::date - 7), ((now() at time zone 'Asia/Bangkok')::date - 1))$job$
);
