-- Per-employee opt-in: normally a WFH employee still taps "clock in/out" in the app (skips
-- the GPS/geofence check, status becomes 'work_from_home' — see clock_in()), but some WFH
-- employees genuinely never open the app to do that. For those, auto-fill their attendance
-- daily instead of requiring any tap at all. Scoped per-employee (not global) — set true only
-- for employees who've been confirmed to need this, everyone else keeps clocking in as usual.
alter table public.employees add column auto_wfh_no_clockin boolean not null default false;

create or replace function public.auto_fill_wfh_attendance()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_work_date date := (now() at time zone 'Asia/Bangkok')::date;
  r record;
  v_shift_id uuid;
  v_is_wfh boolean;
  v_is_day_off boolean;
  v_shift_start time;
  v_shift_end time;
  v_unpaid_break integer;
  v_clock_in timestamptz;
  v_clock_out timestamptz;
begin
  for r in
    select e.id as employee_id, e.org_id
    from employees e
    where e.auto_wfh_no_clockin
      and e.deleted_at is null
      and e.employment_status in ('active', 'probation')
  loop
    -- Already has a row today (e.g. she clocked in herself anyway) — never overwrite real data.
    if exists (select 1 from attendance_records where employee_id = r.employee_id and work_date = v_work_date) then
      continue;
    end if;

    select shift_id, coalesce(is_work_from_home, false), coalesce(is_day_off, false)
      into v_shift_id, v_is_wfh, v_is_day_off
      from shift_assignments
      where employee_id = r.employee_id and work_date = v_work_date
      limit 1;

    if v_shift_id is null or v_is_day_off or not v_is_wfh then
      continue;
    end if;

    select start_time, end_time, unpaid_break_minutes into v_shift_start, v_shift_end, v_unpaid_break
      from work_shifts where id = v_shift_id;
    if v_shift_start is null or v_shift_end is null then
      continue;
    end if;

    v_clock_in := (v_work_date::text || ' ' || v_shift_start::text || '+07:00')::timestamptz;
    v_clock_out := (v_work_date::text || ' ' || v_shift_end::text || '+07:00')::timestamptz;

    insert into attendance_records (
      org_id, employee_id, work_date, shift_id, work_location_id,
      clock_in_server_at, clock_out_server_at,
      status, late_minutes, early_leave_minutes, worked_minutes, needs_review
    ) values (
      r.org_id, r.employee_id, v_work_date, v_shift_id, null,
      v_clock_in, v_clock_out,
      'work_from_home', 0, 0,
      greatest(0, round(extract(epoch from (v_clock_out - v_clock_in)) / 60) - coalesce(v_unpaid_break, 0)),
      false
    );
  end loop;
end;
$function$;

create extension if not exists pg_cron;

select cron.schedule(
  'auto-fill-wfh-attendance-daily',
  '5 17 * * *', -- 00:05 Asia/Bangkok
  $$select public.auto_fill_wfh_attendance();$$
);
