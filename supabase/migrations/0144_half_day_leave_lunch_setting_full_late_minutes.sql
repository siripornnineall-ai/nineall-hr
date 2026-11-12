-- Half-day leave / lateness / OT rules (owner 2026-11-12). Supersedes the 4-hour rule of 0136.
--
-- 1. Lunch break is a setting: policy_settings.setting_type = 'lunch_break', value {"start":"12:00","end":"13:00"}.
-- 2. Half-day leave, judged against each employee's own shift (08:30-17:30, 09:00-18:00, ...):
--      morning leave   -> the day starts at lunch end (13:00)
--      afternoon leave -> the day may end at lunch start (12:00)  (no "work 4 hours" condition)
--    Only APPROVED leave moves the window; a day judged while the leave was pending is re-judged on approval
--    (trg_rejudge_attendance_partial_leave).
-- 3. From 2026-11-13: the grace minutes only decide WHETHER someone is late; once late, the full minutes count
--    (morning leave, clock-in 13:55 -> late 55 min; normal day 08:45 on an 08:30 shift -> late 15 min).
-- 4. From 2026-11-13: auto OT measures lateness from the leave-adjusted start, so approved leave time is never
--    taken off OT; real lateness still is (existing rule).
-- Dates before 2026-11-13 keep their old numbers, nothing is recalculated backwards.

-- 1. lunch break setting ---------------------------------------------------------------------------
insert into public.policy_settings (org_id, setting_type, value, effective_date, notes)
select o.id, 'lunch_break', '{"start":"12:00","end":"13:00"}'::jsonb, date '2026-01-01',
       'เวลาพักกลางวัน (ไม่นับเป็นเวลาทำงาน) ใช้กับการลาครึ่งวัน'
from public.organizations o
on conflict (org_id, setting_type, effective_date) do nothing;

create or replace function public.lunch_break_window(p_org_id uuid, p_work_date date)
returns table(lunch_start time, lunch_end time)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((v.value->>'start')::time, time '12:00'), coalesce((v.value->>'end')::time, time '13:00')
  from (select 1) x
  left join lateral (
    select value from policy_settings
    where org_id = p_org_id and setting_type = 'lunch_break' and effective_date <= p_work_date
      and (end_date is null or end_date >= p_work_date)
    order by effective_date desc limit 1
  ) v on true;
$$;

-- 2. shift window for half-day / hourly leave ---------------------------------------------------------
create or replace function public.effective_shift_window(p_employee_id uuid, p_work_date date, p_shift_start time, p_shift_end time)
returns table(eff_start time, eff_end time)
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_start time := p_shift_start;
  v_end time := p_shift_end;
  v_morning_off boolean := false;
  v_afternoon_off boolean := false;
  v_hourly_start time;
  v_hourly_end time;
  v_lunch_start time := time '12:00';
  v_lunch_end time := time '13:00';
begin
  if p_shift_start is null or p_shift_end is null then
    eff_start := v_start; eff_end := v_end; return next; return;
  end if;

  select w.lunch_start, w.lunch_end into v_lunch_start, v_lunch_end
    from employees e cross join lateral lunch_break_window(e.org_id, p_work_date) w
    where e.id = p_employee_id;
  v_lunch_start := coalesce(v_lunch_start, time '12:00');
  v_lunch_end := coalesce(v_lunch_end, time '13:00');

  select
    bool_or(coalesce(l.end_time, v_lunch_start) <= v_lunch_end and coalesce(l.start_time, p_shift_start) < v_lunch_start),
    bool_or(coalesce(l.start_time, v_lunch_end) >= v_lunch_start)
    into v_morning_off, v_afternoon_off
    from leave_requests l
    where l.employee_id = p_employee_id and l.status = 'approved'
      and p_work_date between l.start_date and l.end_date
      and (l.unit = 'half_day' or (l.unit = 'full_day' and l.total_days < 1));

  if coalesce(v_morning_off, false) then
    v_start := greatest(v_start, v_lunch_end);
  end if;
  if coalesce(v_afternoon_off, false) then
    v_end := least(v_end, v_lunch_start);
  end if;

  select min(l.start_time), max(l.end_time) into v_hourly_start, v_hourly_end
    from leave_requests l
    where l.employee_id = p_employee_id and l.status = 'approved'
      and p_work_date between l.start_date and l.end_date
      and l.unit = 'hourly' and l.start_time is not null and l.end_time is not null;

  if v_hourly_start is not null then
    if v_hourly_start <= p_shift_start + interval '30 minutes' and v_hourly_end > v_start then
      v_start := greatest(v_start, case when v_hourly_end >= v_lunch_start and v_hourly_end <= v_lunch_end then v_lunch_end else v_hourly_end end);
    end if;
    if v_hourly_end >= p_shift_end - interval '30 minutes' and v_hourly_start < v_end then
      v_end := least(v_end, case when v_hourly_start >= v_lunch_start and v_hourly_start <= v_lunch_end then v_lunch_start else v_hourly_start end);
    end if;
  end if;

  eff_start := v_start;
  eff_end := v_end;
  return next;
end;
$function$;

-- 3 + 4. patch the three functions in place (only the lines below change) -----------------------------
do $mig$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  -- clock_in: full late minutes once past the grace
  v_def := pg_get_functiondef((select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'clock_in'));
  v_old := $q$        v_late_minutes := v_minutes_late - coalesce(v_grace_late, 0);$q$;
  v_new := $q$        v_late_minutes := case when v_work_date >= date '2026-11-13' then v_minutes_late else v_minutes_late - coalesce(v_grace_late, 0) end;$q$;
  if position(v_old in v_def) = 0 then raise exception 'clock_in: expected text not found'; end if;
  execute replace(v_def, v_old, v_new);

  -- rejudge_attendance_day: same rule
  v_def := pg_get_functiondef((select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rejudge_attendance_day'));
  v_old := $q$    v_late := greatest(0, v_late - coalesce(s.grace_minutes_late, 0));$q$;
  v_new := $q$    v_late := case when a.work_date >= date '2026-11-13'
                then (case when v_late > coalesce(s.grace_minutes_late, 0) then v_late else 0 end)
                else greatest(0, v_late - coalesce(s.grace_minutes_late, 0)) end;$q$;
  if position(v_old in v_def) = 0 then raise exception 'rejudge_attendance_day: expected text not found'; end if;
  execute replace(v_def, v_old, v_new);

  -- apply_auto_overtime: lateness measured from the leave-adjusted start
  v_def := pg_get_functiondef((select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'apply_auto_overtime'));
  v_old := $q$        if p.clock_in_server_at is not null and v_shift.start_time is not null and not v_half_day_morning_off then
          v_late_raw := greatest(0, round(extract(epoch from (
            (p.clock_in_server_at at time zone 'Asia/Bangkok')::time - v_shift.start_time
          )) / 60))::integer;
          v_late_raw := greatest(0, v_late_raw - coalesce(v_shift.grace_minutes_late, 0));
        end if;$q$;
  v_new := $q$        if p.clock_in_server_at is not null and v_shift.start_time is not null and not v_half_day_morning_off then
          if p.work_date >= date '2026-11-13' then
            -- approved leave at the start of the day is not lateness (owner 2026-11-12)
            v_late_raw := greatest(0, round(extract(epoch from (
              (p.clock_in_server_at at time zone 'Asia/Bangkok')::time
              - coalesce((select w.eff_start from effective_shift_window(p.employee_id, p.work_date, v_shift.start_time, v_shift.end_time) w), v_shift.start_time)
            )) / 60))::integer;
            if v_late_raw <= coalesce(v_shift.grace_minutes_late, 0) then
              v_late_raw := 0;
            end if;
          else
            v_late_raw := greatest(0, round(extract(epoch from (
              (p.clock_in_server_at at time zone 'Asia/Bangkok')::time - v_shift.start_time
            )) / 60))::integer;
            v_late_raw := greatest(0, v_late_raw - coalesce(v_shift.grace_minutes_late, 0));
          end if;
        end if;$q$;
  if position(v_old in v_def) = 0 then raise exception 'apply_auto_overtime: expected text not found'; end if;
  execute replace(v_def, v_old, v_new);
end
$mig$;
