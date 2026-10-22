-- Resigned / terminated people are taken out of the system (owner 2026-10-22: "เอาคนที่ลาออก
-- ออกไปจากระบบ ไม่ต้องเอาขึ้นมา"). offboard_employee() only flagged profiles.is_active = false, which
-- did not stop an existing login (they still had live sessions), and left day-off placeholders
-- on the Attendance page for dates after they left.
--
-- When an employee becomes resigned / terminated, this trigger now:
--   * bans the login and ends every session, so the app can no longer be used
--   * removes attendance placeholders (day off / holiday / absent, never a real clock-in) and
--     schedule rows dated AFTER the last day
--   * sets profiles.is_active = false
-- and when they are set back to active / probation it lifts the ban again.
-- Their history (attendance, leave, payroll) is untouched; the admin pages hide them unless
-- the employee list is filtered to that status.

create or replace function public.employee_leave_cleanup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_last_day date;
  v_prev_trusted text;
begin
  if new.employment_status::text in ('resigned', 'terminated') and old.employment_status::text is distinct from new.employment_status::text then
    v_last_day := coalesce(new.resignation_date, new.termination_date, (now() at time zone 'Asia/Bangkok')::date);

    update auth.users u set banned_until = now() + interval '100 years'
      from profiles p where p.employee_id = new.id and u.id = p.id;
    delete from auth.refresh_tokens t using profiles p where p.employee_id = new.id and t.user_id = p.id::text;
    delete from auth.sessions s using profiles p where p.employee_id = new.id and s.user_id = p.id;
    update profiles set is_active = false where employee_id = new.id;

    v_prev_trusted := current_setting('app.trusted_attendance_write', true);
    perform set_config('app.trusted_attendance_write', 'true', true);
    delete from attendance_records
      where employee_id = new.id and work_date > v_last_day and clock_in_server_at is null
        and status::text in ('day_off', 'holiday', 'absent');
    perform set_config('app.trusted_attendance_write', coalesce(v_prev_trusted, ''), true);
    delete from shift_assignments where employee_id = new.id and work_date > v_last_day;
  elsif new.employment_status::text in ('active', 'probation') and old.employment_status::text in ('resigned', 'terminated') then
    update auth.users u set banned_until = null
      from profiles p where p.employee_id = new.id and u.id = p.id;
    update profiles set is_active = true where employee_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employee_leave_cleanup on public.employees;
create trigger trg_employee_leave_cleanup
  after update of employment_status on public.employees
  for each row execute function public.employee_leave_cleanup();

-- Apply to the people who have already resigned.
do $$
declare
  e record;
  v_last_day date;
  v_prev_trusted text;
begin
  for e in select * from employees where employment_status::text in ('resigned', 'terminated') loop
    v_last_day := coalesce(e.resignation_date, e.termination_date, current_date);
    update auth.users u set banned_until = now() + interval '100 years'
      from profiles p where p.employee_id = e.id and u.id = p.id;
    delete from auth.refresh_tokens t using profiles p where p.employee_id = e.id and t.user_id = p.id::text;
    delete from auth.sessions s using profiles p where p.employee_id = e.id and s.user_id = p.id;
    update profiles set is_active = false where employee_id = e.id;
    v_prev_trusted := current_setting('app.trusted_attendance_write', true);
    perform set_config('app.trusted_attendance_write', 'true', true);
    delete from attendance_records
      where employee_id = e.id and work_date > v_last_day and clock_in_server_at is null
        and status::text in ('day_off', 'holiday', 'absent');
    perform set_config('app.trusted_attendance_write', coalesce(v_prev_trusted, ''), true);
    delete from shift_assignments where employee_id = e.id and work_date > v_last_day;
  end loop;
end $$;
