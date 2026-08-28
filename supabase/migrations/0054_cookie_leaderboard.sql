-- All-time cookie totals for the "รางวัลคนมีน้ำใจ" leaderboard — cumulative, not
-- monthly (the 5/month cap in migration 0053 only limits how many a person can GIVE
-- out each month; received totals are meant to keep growing).
create or replace function get_cookie_leaderboard()
returns table (employee_id uuid, employee_code text, first_name text, last_name text, nickname text, photo_url text, total_cookies bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url, count(*)::bigint
  from kindness_cookies kc
  join employees e on e.id = kc.receiver_employee_id
  where kc.org_id = current_org_id()
    and e.deleted_at is null
  group by e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url
  order by count(*) desc
  limit 3;
$$;
revoke all on function get_cookie_leaderboard() from public;
grant execute on function get_cookie_leaderboard() to authenticated;
