-- Kaning (90031): last full-time day 2026-11-25; from 2026-11-26 she is a freelancer (work-for-hire contract) who
-- comes in on Saturdays only (owner 2026-11-06).
--   * employment_type 'contract' = freelancer: the daily leave sync no longer gives sick/personal/vacation.
--   * schedule from 26 Nov: Saturdays are work days (same shift/location as her weekdays), all other days off.
--   * a one-shot pg_cron job (00:10 Bangkok on 26 Nov) switches her employment_type to 'contract' and closes her
--     2026 sick/personal/vacation balances (entitlement = used + pending, nothing left to take), then unschedules itself.
-- Her pay basis / per-Saturday amount (employee_compensation) is NOT changed here: the owner has not given it yet.

create or replace function public.sync_leave_entitlements(p_employee_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
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
       and e.employment_type <> 'contract'
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
$function$;

update shift_assignments
   set is_day_off = (extract(dow from work_date) <> 6),
       shift_id = case when extract(dow from work_date) = 6 then '00000000-0000-0000-0000-000000000602'::uuid else null end,
       updated_at = now()
 where employee_id = 'c3e7535d-7f20-4202-aba3-2e61bc8ecba2'
   and work_date >= date '2026-11-26'
   and not is_work_from_home and not is_off_site;

select cron.schedule('freelance-switch-90031', '10 17 25 11 *', $job$
  update employees set employment_type = 'contract', updated_at = now()
   where id = 'c3e7535d-7f20-4202-aba3-2e61bc8ecba2' and deleted_at is null;
  update leave_balances b
     set entitled_days = greatest(0, b.used_days + b.pending_days - b.carried_over_days)
    from leave_types lt
   where lt.id = b.leave_type_id and lt.code in ('SICK', 'PERSONAL', 'VACATION')
     and b.employee_id = 'c3e7535d-7f20-4202-aba3-2e61bc8ecba2' and b.year = 2026;
  select cron.unschedule('freelance-switch-90031');
$job$);
