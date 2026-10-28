-- Standing rule (owner 2026-10-28): the late leaderboard card on the dashboard (admin web and employee app
-- home) never shows someone whose lateness was made up by staying late (late_minutes is already 0 then) or
-- has already been taken off OT. Until now only staff flagged hide_late_status were excluded; this applies
-- to everyone, using the same coverage logic (_late_covered_dates, 0121). Computed once per employee.
create or replace function public.get_late_leaderboard(p_month_start date, p_month_end date)
returns table(employee_id uuid, employee_code text, first_name text, last_name text, nickname text, photo_url text, total_late_minutes bigint, late_days bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  with late as (
    select ar.employee_id, ar.work_date, ar.late_minutes
    from attendance_records ar
    where ar.org_id = current_org_id()
      and ar.work_date >= p_month_start and ar.work_date <= p_month_end
      and ar.late_minutes > 0
  ), covered as (
    select x.employee_id, c.d as work_date
    from (select distinct employee_id from late) x
    cross join lateral public._late_covered_dates(x.employee_id, p_month_start, p_month_end) as c(d)
  )
  select e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url,
    sum(l.late_minutes)::bigint, count(*)::bigint
  from late l
  join employees e on e.id = l.employee_id
  left join covered cv on cv.employee_id = l.employee_id and cv.work_date = l.work_date
  where e.deleted_at is null and cv.work_date is null
  group by e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url
  order by sum(l.late_minutes) desc
  limit 5;
$$;
