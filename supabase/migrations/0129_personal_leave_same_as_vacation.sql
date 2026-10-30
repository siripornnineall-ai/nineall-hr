-- Personal leave is calculated exactly like vacation (owner 2026-10-30): 0 before 12 months of service; in the
-- calendar year of the first anniversary 6 x (12 - hire month) / 12; from the next year the full tier of current
-- tenure (12 months = 6, 24 = 8, 48 = 10, 84 = 15). Rounded to half days. Sick leave is unchanged (30 days earned
-- monthly, full at 12 months). Replaces the month-by-month personal ladder of 0125-0128.
-- The daily sync keeps a personal/vacation row only while it has an entitlement or has been used; an unused
-- row left at 0 is removed so screens show "no entitlement yet".

create or replace function public.leave_entitlement_days(p_code text, p_hire_date date, p_as_of date)
returns numeric
language plpgsql
immutable
as $$
declare
  m integer;
begin
  m := greatest(0, (extract(year from p_as_of)::int - extract(year from p_hire_date)::int) * 12
                   + (extract(month from p_as_of)::int - extract(month from p_hire_date)::int)
                   - case when extract(day from p_as_of) < extract(day from p_hire_date) then 1 else 0 end);

  if p_code = 'SICK' then
    return round(round(30 * least(m, 12) / 12.0 * 2) / 2, 2);
  end if;

  -- vacation and personal leave
  if m < 12 then
    return 0;
  end if;
  if extract(year from p_as_of)::int = extract(year from p_hire_date)::int + 1 then
    return round(round(6.0 * (12 - extract(month from p_hire_date)::int) / 12 * 2) / 2, 2);
  end if;
  return case when m >= 84 then 15 when m >= 48 then 10 when m >= 24 then 8 else 6 end;
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
  v_year integer := extract(year from v_today)::int;
  v_count integer;
begin
  if auth.uid() is not null and not coalesce(is_admin_or_hr(), false) then
    raise exception 'not allowed';
  end if;

  with upserted as (
    insert into leave_balances (employee_id, leave_type_id, year, entitled_days)
    select e.id, lt.id, v_year, public.leave_entitlement_days(lt.code, e.hire_date, v_today)
      from employees e
      join leave_types lt on lt.org_id = e.org_id and lt.is_active and lt.code in ('SICK', 'PERSONAL', 'VACATION')
     where e.deleted_at is null
       and e.employment_status in ('active', 'probation')
       and e.hire_date <= v_today
       and (p_employee_id is null or e.id = p_employee_id)
       and (lt.code = 'SICK'
            or public.leave_entitlement_days(lt.code, e.hire_date, v_today) > 0
            or exists (select 1 from leave_balances x
                        where x.employee_id = e.id and x.leave_type_id = lt.id and x.year = v_year))
    on conflict (employee_id, leave_type_id, year) do update
      set entitled_days = excluded.entitled_days
      where leave_balances.entitled_days is distinct from excluded.entitled_days
    returning 1
  )
  select count(*) into v_count from upserted;

  delete from leave_balances b
   using leave_types lt
   where lt.id = b.leave_type_id and lt.code in ('PERSONAL', 'VACATION')
     and b.year = v_year
     and b.entitled_days = 0 and b.carried_over_days = 0 and b.used_days = 0 and b.pending_days = 0
     and (p_employee_id is null or b.employee_id = p_employee_id);

  return v_count;
end;
$$;

revoke all on function public.sync_leave_entitlements(uuid) from public;
grant execute on function public.sync_leave_entitlements(uuid) to authenticated;
