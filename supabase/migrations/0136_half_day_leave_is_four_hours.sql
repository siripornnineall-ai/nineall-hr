-- Half-day leave = 4 working hours on each side (owner 2026-11-06, to be fair to morning and afternoon leave).
--
-- Before: morning leave moved the start to 13:00 and afternoon leave moved the end to 12:00, so a person on
-- afternoon leave (09:00-18:00 shift) only worked 3 h while a person on morning leave worked 5 h, yet both
-- were charged 0.5 day.
-- Now, from 2026-11-07 on:
--   * afternoon leave: work 4 h straight from the shift start (09:00-13:00; 08:30-12:30), no lunch break;
--   * morning leave:   work 13:00 until the normal shift end (owner changed this the same day; 13:00-18:00);
-- Lateness / early-leave are judged against that window. Earlier dates keep the old window so history and the
-- current payroll cutoff are not re-judged. Leave balance deduction (0.5 day) is unchanged.

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
  v_four_hour_rule boolean := p_work_date >= date '2026-11-07';
begin
  if p_shift_start is null or p_shift_end is null then
    eff_start := v_start; eff_end := v_end; return next; return;
  end if;

  select
    bool_or(coalesce(l.end_time, time '12:00') <= time '13:00' and coalesce(l.start_time, time '08:00') < time '12:00'),
    bool_or(coalesce(l.start_time, time '13:00') >= time '12:00')
    into v_morning_off, v_afternoon_off
    from leave_requests l
    where l.employee_id = p_employee_id and l.status in ('pending', 'approved')
      and p_work_date between l.start_date and l.end_date
      and (l.unit = 'half_day' or (l.unit = 'full_day' and l.total_days < 1));

  if coalesce(v_morning_off, false) then
    v_start := greatest(v_start, time '13:00');
  end if;
  if coalesce(v_afternoon_off, false) then
    if v_four_hour_rule and p_shift_end > p_shift_start then
      v_end := least(v_end, p_shift_start + interval '4 hours');
    else
      v_end := least(v_end, time '12:00');
    end if;
  end if;

  select min(l.start_time), max(l.end_time) into v_hourly_start, v_hourly_end
    from leave_requests l
    where l.employee_id = p_employee_id and l.status in ('pending', 'approved')
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
