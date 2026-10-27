-- late_covered_dates() v3 (owner 2026-10-27: "show it right away, don't wait for the payroll run").
-- For staff on the previous-cycle rule, a late day is covered the moment OT exists for it, taking the
-- OT of the PREVIOUS OT window first and then the same window's own OT, with each window's OT used up as
-- late days (in date order) draw on it, so the same OT is never counted twice. Staff without the rule use
-- only their own window. A day counts as covered only when the OT left is enough for all of its minutes.
-- Nothing is deducted by this function; payroll and the OT page do the real deduction. It only decides the
-- label the Attendance screens show (on time + "หักจาก OT แล้ว" vs late).

create or replace function public.late_covered_dates(p_employee_id uuid, p_from date, p_to date)
returns setof date
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_cal boolean;
  v_prev boolean;
  v_rem jsonb := '{}'::jsonb;
  r record;
  w record;
  v_win text;
  v_prev_win text;
  v_need numeric;
  v_take numeric;
  v_have numeric;
begin
  if not (coalesce(is_admin_or_hr(), false) or p_employee_id = current_employee_id()) then
    return;
  end if;

  select ot_calendar_month, late_deduct_from_prev_ot_since is not null into v_cal, v_prev
    from employees where id = p_employee_id;
  if v_cal is null then
    return;
  end if;

  -- OT minutes available per window
  for w in
    select to_char(
             case when v_cal then date_trunc('month', o.work_date)
                  when extract(day from o.work_date) >= 26 then date_trunc('month', o.work_date) + interval '1 month'
                  else date_trunc('month', o.work_date) end, 'YYYY-MM-DD') as win,
           sum(coalesce(o.approved_hours, o.requested_hours) * 60) as mins
      from overtime_requests o
     where o.employee_id = p_employee_id and o.status = 'approved'
       and o.work_date between p_from - 120 and p_to + 31
     group by 1
  loop
    v_rem := jsonb_set(v_rem, array[w.win], to_jsonb(w.mins));
  end loop;

  -- late days in date order, each drawing on previous-window OT first, then its own window's
  for r in
    select a.work_date as d, a.late_minutes as m,
           to_char(
             case when v_cal then date_trunc('month', a.work_date)
                  when extract(day from a.work_date) >= 26 then date_trunc('month', a.work_date) + interval '1 month'
                  else date_trunc('month', a.work_date) end, 'YYYY-MM-DD') as win
      from attendance_records a
     where a.employee_id = p_employee_id and a.status = 'late' and a.late_minutes > 0
       and a.work_date between p_from - 90 and p_to
     order by a.work_date
  loop
    v_need := r.m;
    v_win := r.win;
    v_prev_win := to_char((v_win::date - interval '1 month')::date, 'YYYY-MM-DD');

    if v_prev then
      v_have := coalesce((v_rem ->> v_prev_win)::numeric, 0);
      v_take := least(v_need, v_have);
      if v_take > 0 then
        v_rem := jsonb_set(v_rem, array[v_prev_win], to_jsonb(v_have - v_take));
        v_need := v_need - v_take;
      end if;
    end if;
    if v_need > 0 then
      v_have := coalesce((v_rem ->> v_win)::numeric, 0);
      v_take := least(v_need, v_have);
      if v_take > 0 then
        v_rem := jsonb_set(v_rem, array[v_win], to_jsonb(v_have - v_take));
        v_need := v_need - v_take;
      end if;
    end if;

    if v_need <= 0 and r.d between p_from and p_to then
      return next r.d;
    end if;
  end loop;
end;
$$;
