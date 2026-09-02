-- The kindness-cookie leaderboard counted all-time totals; HR wants it to reset every
-- calendar month like the late-arrival leaderboard already does. kindness_cookies.month
-- already exists (used by enforce_cookie_monthly_limit()'s 5/month give-cap), so this
-- just filters by it.
--
-- Adding a parameter changes the function's signature, so CREATE OR REPLACE would create
-- a THIRD overload alongside the existing one instead of replacing it (the same mistake
-- already made once with this function's p_limit param) — drop the old signature first.
drop function if exists public.get_cookie_leaderboard(integer);

create function public.get_cookie_leaderboard(p_limit integer default 3, p_month date default date_trunc('month', current_date)::date)
returns table(employee_id uuid, employee_code text, first_name text, last_name text, nickname text, photo_url text, total_cookies bigint)
language sql
stable security definer
set search_path to 'public'
as $function$
  select e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url, count(*)::bigint
  from kindness_cookies kc
  join employees e on e.id = kc.receiver_employee_id
  where kc.org_id = current_org_id()
    and kc.month = p_month
    and e.deleted_at is null
  group by e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url
  order by count(*) desc
  limit p_limit;
$function$;
