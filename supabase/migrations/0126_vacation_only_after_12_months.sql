-- Vacation is only earned once 12 months of service are completed (owner 2026-10-29); before that it is 0.
-- From 12 months on it follows the same ladder as before (6 at 12 months, growing month by month to 8 at 24,
-- 10 at 48, 15 at 84). Personal and sick leave are unchanged (0125).

create or replace function public.leave_entitlement_days(p_code text, p_hire_date date, p_as_of date)
returns numeric
language plpgsql
immutable
as $$
declare
  m integer;
  d numeric;
begin
  m := greatest(0, (extract(year from p_as_of)::int - extract(year from p_hire_date)::int) * 12
                   + (extract(month from p_as_of)::int - extract(month from p_hire_date)::int)
                   - case when extract(day from p_as_of) < extract(day from p_hire_date) then 1 else 0 end);

  if p_code = 'SICK' then
    return round(30 * least(m, 12) / 12.0, 2);
  end if;

  if p_code = 'VACATION' and m < 12 then
    return 0;
  end if;

  if m < 12 then
    d := 6.0 * m / 12;
  elsif m < 24 then
    d := 6 + 2.0 * (m - 12) / 12;
  elsif m < 48 then
    d := 8 + 2.0 * (m - 24) / 24;
  elsif m < 84 then
    d := 10 + 5.0 * (m - 48) / 36;
  else
    d := 15;
  end if;
  return round(d, 2);
end;
$$;

-- The daily sync no longer creates a vacation row (not even a 0-day one) before 12 months of service, so
-- screens keep showing "no entitlement yet" for those people.
create or replace function public.sync_leave_entitlements(p_employee_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_count integer;
begin
  if auth.uid() is not null and not coalesce(is_admin_or_hr(), false) then
    raise exception 'not allowed';
  end if;

  with upserted as (
    insert into leave_balances (employee_id, leave_type_id, year, entitled_days)
    select e.id, lt.id, extract(year from v_today)::int,
           public.leave_entitlement_days(lt.code, e.hire_date, v_today)
      from employees e
      join leave_types lt on lt.org_id = e.org_id and lt.is_active and lt.code in ('SICK', 'PERSONAL', 'VACATION')
     where e.deleted_at is null
       and e.employment_status in ('active', 'probation')
       and e.hire_date <= v_today
       and (p_employee_id is null or e.id = p_employee_id)
       and (lt.code <> 'VACATION' or public.leave_entitlement_days(lt.code, e.hire_date, v_today) > 0)
    on conflict (employee_id, leave_type_id, year) do update
      set entitled_days = excluded.entitled_days
      where leave_balances.entitled_days is distinct from excluded.entitled_days
    returning 1
  )
  select count(*) into v_count from upserted;
  return v_count;
end;
$$;

revoke all on function public.sync_leave_entitlements(uuid) from public;
grant execute on function public.sync_leave_entitlements(uuid) to authenticated;
