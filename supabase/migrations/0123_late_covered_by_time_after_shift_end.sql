-- Late coverage for the HR and Content teams (owner 2026-10-29): the time they stay after the shift ends
-- (after 18:00) makes up for ALL their lateness of the whole year. Same-day make-up is already applied when
-- the day is judged (rejudge_attendance_day: time past the shift end cancels lateness minute for minute), so
-- what is left on a "late" day is lateness the same day could not cover. Those leftovers now draw on the time
-- stayed after the shift end on OTHER days of the year, oldest lateness first. A late day counts as covered
-- only when the pool left covers all of its minutes. Replaces the OT-request based version (0121): approved
-- OT requests are far fewer than the real after-shift time, and the rule only starting 2026-08-26 left earlier
-- lateness showing as late. Display only; nothing is deducted here.

create or replace function public._late_covered_dates(p_employee_id uuid, p_from date, p_to date)
returns setof date
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_year_start date := make_date(extract(year from p_to)::int, 1, 1);
  v_year_end date := make_date(extract(year from p_to)::int, 12, 31);
  v_pool numeric := 0;
  r record;
begin
  -- Spare time per day: minutes after the shift end that were not already used to cancel that day's lateness.
  select coalesce(sum(greatest(0, x.after_end - x.orig_late)), 0) into v_pool
  from (
    select
      greatest(0, round(extract(epoch from (a.clock_out_server_at - ((a.work_date + s.end_time) at time zone 'Asia/Bangkok'))) / 60))::int as after_end,
      greatest(0, greatest(0, round(extract(epoch from (a.clock_in_server_at - ((a.work_date + s.start_time) at time zone 'Asia/Bangkok'))) / 60))::int - coalesce(s.grace_minutes_late, 0)) as orig_late
    from attendance_records a
    join work_shifts s on s.id = a.shift_id
    where a.employee_id = p_employee_id
      and a.work_date between v_year_start and v_year_end
      and a.status in ('on_time', 'late', 'early_leave')
      and a.clock_in_server_at is not null and a.clock_out_server_at is not null
  ) x;

  for r in
    select a.work_date as d, a.late_minutes as m
      from attendance_records a
     where a.employee_id = p_employee_id and a.status = 'late' and a.late_minutes > 0
       and a.work_date between v_year_start and v_year_end
     order by a.work_date
  loop
    if v_pool >= r.m then
      v_pool := v_pool - r.m;
      if r.d between p_from and p_to then
        return next r.d;
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public._late_covered_dates(uuid, date, date) from public;
