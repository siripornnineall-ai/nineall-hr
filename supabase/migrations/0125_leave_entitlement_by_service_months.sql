-- Leave entitlement by completed months of service (owner 2026-10-29).
--   * Personal leave and vacation share one ladder: 12 months = 6 days, 24 = 8, 48 = 10, 84 = 15. Below
--     12 months it is 6 x months/12; between two steps it grows month by month towards the next step
--     (12->24: 6..8, 24->48: 8..10, 48->84: 10..15).
--   * Sick leave stays at 30 days a year, earned month by month and full after 12 months of service.
-- Entitlement follows tenure, not the calendar year the person joined in. sync_leave_entitlements() writes
-- the current year's entitled_days (used/pending/carried-over are never touched) and runs every day, so the
-- balance grows as months are completed. Other leave types are still granted by the app as before.

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

select cron.schedule('sync-leave-entitlements-daily', '20 17 * * *', 'select public.sync_leave_entitlements();');
