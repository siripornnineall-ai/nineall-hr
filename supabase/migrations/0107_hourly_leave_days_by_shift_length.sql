-- Hourly leave is converted to days by the length of the employee's shift (owner 2026-10-15,
-- "ตามกะ"): hours leave / (shift end - shift start). A 4 h leave on a 08:30-17:30 shift is
-- 4 / 9 = 0.44 day; on a 08:30-18:00 shift it is 4 / 9.5 = 0.42 day. Before this, the forms
-- divided by a flat 8 and some rows had been entered by hand with other numbers (30 minutes
-- stored as 0.01 day), which is what payroll uses to deduct unpaid leave.
--
-- 1. leave_shift_hours(): the shift length for that person on that date.
-- 2. BEFORE INSERT trigger: sets total_days for every new hourly request, whichever form sent
--    it. It sorts before trg_leave_requests_reserve so the balance reservation uses the same
--    number.
-- 3. One-off correction of existing hourly requests, moving the leave balance (used / pending)
--    by the difference.

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
  v_hours numeric;
begin
  select s.start_time, s.end_time into v_start, v_end
    from shift_assignments a join work_shifts s on s.id = a.shift_id
    where a.employee_id = p_employee_id and a.work_date = p_date and a.shift_id is not null
    limit 1;
  if v_start is null then
    select s.start_time, s.end_time into v_start, v_end
      from attendance_records r join work_shifts s on s.id = r.shift_id
      where r.employee_id = p_employee_id and r.work_date = p_date and r.shift_id is not null
      limit 1;
  end if;
  if v_start is null then
    -- Nothing on that date: use the most recent shift they were given before it, else after.
    select s.start_time, s.end_time into v_start, v_end
      from shift_assignments a join work_shifts s on s.id = a.shift_id
      where a.employee_id = p_employee_id and a.shift_id is not null
      order by abs(a.work_date - p_date)
      limit 1;
  end if;
  if v_start is null or v_end is null then
    return 9;
  end if;
  v_hours := extract(epoch from (v_end - v_start)) / 3600.0;
  if v_hours <= 0 then
    v_hours := v_hours + 24;
  end if;
  return v_hours;
end;
$$;

revoke all on function public.leave_shift_hours(uuid, date) from public;
grant execute on function public.leave_shift_hours(uuid, date) to authenticated;

create or replace function public.set_hourly_leave_days()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hours numeric;
begin
  if new.unit::text = 'hourly' and new.start_time is not null and new.end_time is not null and new.end_time > new.start_time then
    v_hours := extract(epoch from (new.end_time - new.start_time)) / 3600.0;
    new.total_days := round(v_hours / leave_shift_hours(new.employee_id, new.start_date), 2);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_leave_requests_a_hourly_days on public.leave_requests;
create trigger trg_leave_requests_a_hourly_days
  before insert on public.leave_requests
  for each row execute function public.set_hourly_leave_days();

-- One-off: recompute existing hourly requests and move the balances by the difference.
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
    v_new := round((extract(epoch from (r.end_time - r.start_time)) / 3600.0) / leave_shift_hours(r.employee_id, r.start_date), 2);
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
