create or replace function public.get_late_leaderboard(p_month_start date, p_month_end date)
 returns table(employee_id uuid, employee_code text, first_name text, last_name text, nickname text, photo_url text, total_late_minutes bigint, late_days bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url,
    sum(ar.late_minutes)::bigint, count(*) filter (where ar.late_minutes > 0)::bigint
  from attendance_records ar
  join employees e on e.id = ar.employee_id
  where ar.org_id = current_org_id()
    and ar.work_date >= p_month_start and ar.work_date <= p_month_end
    and ar.late_minutes > 0
    and e.deleted_at is null
  group by e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url
  order by sum(ar.late_minutes) desc
  limit 5;
$function$;
