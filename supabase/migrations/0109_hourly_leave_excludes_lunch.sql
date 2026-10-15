-- Correction to 0107 (owner 2026-10-15): hourly leave is converted to days by the shift's WORKING
-- hours, and the 12:00-13:00 lunch break is not leave time.
--   days = (leave hours, minus any overlap with 12:00-13:00) / (shift length - its unpaid break)
-- So on a 08:30-17:30 shift (8 working hours): 13:30-17:30 = 4 / 8 = 0.50 day, and a leave
-- from 11:00 to 14:00 counts 2 hours, not 3. A 08:30-18:00 shift has 8.5 working hours.

create or replace function public.leave_shift_hours(p_employee_id uuid, p_date date)
returns numeric
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_start time;
  v_end time;
  v_break integer;
  v_hours numeric;
begin
  select s.start_time, s.end_time, coalesce(s.unpaid_break_minutes, 0) into v_start, v_end, v_break
    from shift_assignments a join work_shifts s on s.id = a.shift_id
    where a.employee_id = p_employee_id and a.work_date = p_date and a.shift_id is not null
    limit 1;
  if v_start is null then
    select s.start_time, s.end_time, coalesce(s.unpaid_break_minutes, 0) into v_start, v_end, v_break
      from attendance_records r join work_shifts s on s.id = r.shift_id
      where r.employee_id = p_employee_id and r.work_date = p_date and r.shift_id is not null
      limit 1;
  end if;
  if v_start is null then
    select s.start_time, s.end_time, coalesce(s.unpaid_break_minutes, 0) into v_start, v_end, v_break
      from shift_assignments a join work_shifts s on s.id = a.shift_id
      where a.employee_id = p_employee_id and a.shift_id is not null
      order by abs(a.work_date - p_date)
      limit 1;
  end if;
  if v_start is null or v_end is null then
    return 8;
  end if;
  v_hours := extract(epoch from (v_end - v_start)) / 3600.0;
  if v_hours <= 0 then
    v_hours := v_hours + 24;
  end if;
  return greatest(1, v_hours - v_break / 60.0);
end;
$$;

-- Hours of a leave interval that are real working time (lunch 12:00-13:00 removed).
create or replace function public.leave_hours_excluding_lunch(p_start time, p_end time)
returns numeric
language sql
immutable
as $$
  select greatest(0,
    extract(epoch from (p_end - p_start)) / 3600.0
    - greatest(0, extract(epoch from (least(p_end, time '13:00') - greatest(p_start, time '12:00'))) / 3600.0)
  );
$$;

create or replace function public.set_hourly_leave_days()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.unit::text = 'hourly' and new.start_time is not null and new.end_time is not null and new.end_time > new.start_time then
    new.total_days := round(leave_hours_excluding_lunch(new.start_time, new.end_time) / leave_shift_hours(new.employee_id, new.start_date), 2);
  end if;
  return new;
end;
$$;

-- Recompute existing hourly requests; move balances by the difference.
do $$
declare
  r record;
  v_new numeric;
  v_delta numeric;
  v_code text;
  v_year int;
begin
  for r in
    select l.* from leave_requests l
    where l.unit::text = 'hourly' and l.start_time is not null and l.end_time is not null and l.end_time > l.start_time
  loop
    v_new := round(leave_hours_excluding_lunch(r.start_time, r.end_time) / leave_shift_hours(r.employee_id, r.start_date), 2);
    v_delta := v_new - r.total_days;
    if v_delta = 0 then
      continue;
    end if;
    update leave_requests set total_days = v_new where id = r.id;
    select code into v_code from leave_types where id = r.leave_type_id;
    v_year := extract(year from r.start_date);
    if v_code not in ('WFH', 'OFFSITE') then
      if r.status = 'approved' then
        update leave_balances set used_days = greatest(0, used_days + v_delta)
          where employee_id = r.employee_id and leave_type_id = r.leave_type_id and year = v_year;
      elsif r.status = 'pending' then
        update leave_balances set pending_days = greatest(0, pending_days + v_delta)
          where employee_id = r.employee_id and leave_type_id = r.leave_type_id and year = v_year;
      end if;
    end if;
  end loop;
end $$;
