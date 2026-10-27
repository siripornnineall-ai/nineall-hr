-- late_covered_dates() v4 (owner 2026-10-27, for Kom-kaem): "deduct the older lateness first, then the newer".
-- Late days are still taken in date order, but a late day may now also draw on OT of LATER windows once the
-- previous and own window's OT are used up, so an older late day is covered before a newer one. Before, a new
-- late day could be covered by its own window's fresh OT while an older day stayed "late". Order of use for
-- each late day: previous window's OT (staff on the previous-cycle rule), its own window's OT, then later
-- windows' OT oldest first. A day counts as covered only when the OT found covers all of its minutes.
-- Only lateness from the day the rule started (late_deduct_from_prev_ot_since) on is considered, so old lateness
-- from before the rule cannot use up current OT. Display only; nothing is deducted here.

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
  v_since date;
  v_rem jsonb := '{}'::jsonb;
  r record;
  w record;
  v_win text;
  v_prev_win text;
  v_need numeric;
  v_take numeric;
  v_have numeric;
  k text;
begin
  if not (coalesce(is_admin_or_hr(), false) or p_employee_id = current_employee_id()) then
    return;
  end if;

  select ot_calendar_month, late_deduct_from_prev_ot_since is not null, late_deduct_from_prev_ot_since into v_cal, v_prev, v_since
    from employees where id = p_employee_id;
  if v_cal is null then
    return;
  end if;

  for w in
    select to_char(
             case when v_cal then date_trunc('month', o.work_date)
                  when extract(day from o.work_date) >= 26 then date_trunc('month', o.work_date) + interval '1 month'
                  else date_trunc('month', o.work_date) end, 'YYYY-MM-DD') as win,
           sum(coalesce(o.approved_hours, o.requested_hours) * 60) as mins
      from overtime_requests o
     where o.employee_id = p_employee_id and o.status = 'approved'
       and o.work_date between p_from - 120 and p_to + 62
     group by 1
  loop
    v_rem := jsonb_set(v_rem, array[w.win], to_jsonb(w.mins));
  end loop;

  for r in
    select a.work_date as d, a.late_minutes as m,
           to_char(
             case when v_cal then date_trunc('month', a.work_date)
                  when extract(day from a.work_date) >= 26 then date_trunc('month', a.work_date) + interval '1 month'
                  else date_trunc('month', a.work_date) end, 'YYYY-MM-DD') as win
      from attendance_records a
     where a.employee_id = p_employee_id and a.status = 'late' and a.late_minutes > 0
       and a.work_date between greatest(p_from - 90, coalesce(v_since, p_from - 90)) and p_to
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

    -- own window, then later windows oldest first
    for k in select key from jsonb_object_keys(v_rem) as key where key >= v_win order by key loop
      exit when v_need <= 0;
      v_have := coalesce((v_rem ->> k)::numeric, 0);
      v_take := least(v_need, v_have);
      if v_take > 0 then
        v_rem := jsonb_set(v_rem, array[k], to_jsonb(v_have - v_take));
        v_need := v_need - v_take;
      end if;
    end loop;

    if v_need <= 0 and r.d between p_from and p_to then
      return next r.d;
    end if;
  end loop;
end;
$$;
