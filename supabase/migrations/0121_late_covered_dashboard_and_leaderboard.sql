-- Dashboard counts and the late leaderboard (owner 2026-10-28): lateness that OT has already covered must not
-- show as "late" for the HR and Content teams there either.
--   * _late_covered_dates(): the coverage logic of late_covered_dates() (0120) without the caller check, for
--     use inside other security-definer functions only (not granted to app roles)
--   * late_covered_dates(): now a thin wrapper that keeps the caller check (HR/admin or the person themself)
--   * get_late_leaderboard(): skips covered late days of staff flagged hide_late_status

create or replace function public._late_covered_dates(p_employee_id uuid, p_from date, p_to date)
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

revoke all on function public._late_covered_dates(uuid, date, date) from public;

create or replace function public.late_covered_dates(p_employee_id uuid, p_from date, p_to date)
returns setof date
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not (coalesce(is_admin_or_hr(), false) or p_employee_id = current_employee_id()) then
    return;
  end if;
  return query select * from public._late_covered_dates(p_employee_id, p_from, p_to);
end;
$$;
revoke all on function public.late_covered_dates(uuid, date, date) from public;
grant execute on function public.late_covered_dates(uuid, date, date) to authenticated;

create or replace function public.get_late_leaderboard(p_month_start date, p_month_end date)
returns table(employee_id uuid, employee_code text, first_name text, last_name text, nickname text, photo_url text, total_late_minutes bigint, late_days bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url,
    sum(ar.late_minutes)::bigint, count(*) filter (where ar.late_minutes > 0)::bigint
  from attendance_records ar
  join employees e on e.id = ar.employee_id
  where ar.org_id = current_org_id()
    and ar.work_date >= p_month_start and ar.work_date <= p_month_end
    and ar.late_minutes > 0
    and e.deleted_at is null
    and not (e.hide_late_status and ar.status = 'late'
             and ar.work_date in (select d from public._late_covered_dates(e.id, p_month_start, p_month_end) d))
  group by e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url
  order by sum(ar.late_minutes) desc
  limit 5;
$$;
