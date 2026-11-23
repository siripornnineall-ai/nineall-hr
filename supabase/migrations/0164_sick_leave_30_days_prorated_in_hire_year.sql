-- Sick leave (owner 2026-11-23): 30 days a year, usable from the first day (new hires could not request any: the old rule earned
-- 2.5 days per completed month). In the calendar year of joining the 30 days are shared over the months left after the hire month
-- (same method as personal leave, 0130): joined in November = 1 month = 2.5 days, in October 5, in August 10; rounded to half
-- days. Every later year it is the full 30. Nobody loses days (used / pending are never touched). Replaces the SICK branch of 0125.
-- Applied to production; sync_leave_entitlements() was run right after to update the balances.
create or replace function public.leave_entitlement_days(p_code text, p_hire_date date, p_as_of date)
 returns numeric
 language plpgsql
 immutable
as $function$
declare
  m integer;
begin
  m := greatest(0, (extract(year from p_as_of)::int - extract(year from p_hire_date)::int) * 12
                   + (extract(month from p_as_of)::int - extract(month from p_hire_date)::int)
                   - case when extract(day from p_as_of) < extract(day from p_hire_date) then 1 else 0 end);

  if p_code = 'SICK' then
    if extract(year from p_as_of)::int = extract(year from p_hire_date)::int then
      return round(round(30.0 * (12 - extract(month from p_hire_date)::int) / 12 * 2) / 2, 2);
    end if;
    return 30;
  end if;

  if p_code = 'PERSONAL' then
    if extract(year from p_as_of)::int = extract(year from p_hire_date)::int then
      return round(round(6.0 * (12 - extract(month from p_hire_date)::int) / 12 * 2) / 2, 2);
    end if;
    return 6;
  end if;

  -- VACATION: nothing before 12 completed months; 6 days is the maximum for everyone (owner 2026-11-06),
  -- no 8/10/15 tenure steps.
  if m < 12 then
    return 0;
  end if;
  if extract(year from p_as_of)::int = extract(year from p_hire_date)::int + 1 then
    return round(round(6.0 * (12 - extract(month from p_hire_date)::int) / 12 * 2) / 2, 2);
  end if;
  return 6;
end;
$function$;
