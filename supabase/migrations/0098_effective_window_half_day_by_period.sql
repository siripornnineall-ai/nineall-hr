-- effective_shift_window(): a half-day leave is about which half, not exact times.
--
-- 0097 only trusted a leave that touched the shift's edge (start within 30 min of shift
-- start, or end within 30 min of shift end). A half-day leave entered as 13:00-17:00 on a
-- 09:00-18:00 shift therefore did nothing, and the employee who left at 13:22 for her
-- doctor's appointment came out as 278 minutes early leave (2026-09-09). Half-day leave
-- now sets the window by period: starts at/after 12:00 -> afternoon off, day ends 12:00;
-- ends by 13:00 (or no times at all) -> morning off, day starts 13:00. Hourly leave keeps
-- the edge rule.

create or replace function public.effective_shift_window(p_employee_id uuid, p_work_date date, p_shift_start time, p_shift_end time)
returns table (eff_start time, eff_end time)
language plpgsql stable security definer set search_path = public as $$
declare
  v_start time := p_shift_start;
  v_end time := p_shift_end;
  v_morning_off boolean := false;
  v_afternoon_off boolean := false;
  v_hourly_start time;
  v_hourly_end time;
begin
  if p_shift_start is null or p_shift_end is null then
    eff_start := v_start; eff_end := v_end; return next; return;
  end if;

  -- Half-day (or a 'full_day' row that is really half a day) by period.
  select
    bool_or(coalesce(l.end_time, time '12:00') <= time '13:00' and coalesce(l.start_time, time '08:00') < time '12:00'),
    bool_or(coalesce(l.start_time, time '13:00') >= time '12:00')
    into v_morning_off, v_afternoon_off
    from leave_requests l
    where l.employee_id = p_employee_id and l.status = 'approved'
      and p_work_date between l.start_date and l.end_date
      and (l.unit = 'half_day' or (l.unit = 'full_day' and l.total_days < 1));

  if coalesce(v_morning_off, false) then v_start := greatest(v_start, time '13:00'); end if;
  if coalesce(v_afternoon_off, false) then v_end := least(v_end, time '12:00'); end if;

  -- Hourly leave: only when it runs from (about) the start or to (about) the end of the shift.
  select min(l.start_time), max(l.end_time) into v_hourly_start, v_hourly_end
    from leave_requests l
    where l.employee_id = p_employee_id and l.status = 'approved'
      and p_work_date between l.start_date and l.end_date
      and l.unit = 'hourly' and l.start_time is not null and l.end_time is not null;

  if v_hourly_start is not null then
    if v_hourly_start <= p_shift_start + interval '30 minutes' and v_hourly_end > v_start then
      v_start := greatest(v_start, case when v_hourly_end >= time '12:00' and v_hourly_end <= time '13:00' then time '13:00' else v_hourly_end end);
    end if;
    if v_hourly_end >= p_shift_end - interval '30 minutes' and v_hourly_start < v_end then
      v_end := least(v_end, case when v_hourly_start >= time '12:00' and v_hourly_start <= time '13:00' then time '12:00' else v_hourly_start end);
    end if;
  end if;

  eff_start := v_start;
  eff_end := v_end;
  return next;
end;
$$;

-- Re-judge every worked day this cutoff window that has partial-day leave on it.
select rejudge_attendance_day(a.id)
  from attendance_records a
  where a.clock_in_server_at is not null and a.status in ('on_time', 'late', 'early_leave')
    and a.work_date >= '2026-08-26'
    and exists (
      select 1 from leave_requests l
        where l.employee_id = a.employee_id and l.status = 'approved'
          and a.work_date between l.start_date and l.end_date
          and (l.unit <> 'full_day' or l.total_days < 1)
    );
