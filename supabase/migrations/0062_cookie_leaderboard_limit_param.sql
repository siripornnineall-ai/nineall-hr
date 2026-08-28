-- Lets the dashboard "top N kindness cookie" card fetch more than 3 rows (for the
-- expandable "ดูเพิ่มเติม" list) while keeping the default at 3 for any other caller.
create or replace function public.get_cookie_leaderboard(p_limit integer default 3)
returns table(employee_id uuid, employee_code text, first_name text, last_name text, nickname text, photo_url text, total_cookies bigint)
language sql
stable security definer
set search_path to 'public'
as $function$
  select e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url, count(*)::bigint
  from kindness_cookies kc
  join employees e on e.id = kc.receiver_employee_id
  where kc.org_id = current_org_id()
    and e.deleted_at is null
  group by e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url
  order by count(*) desc
  limit p_limit;
$function$;
