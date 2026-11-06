-- Vacation leave is 6 days at most for everyone (owner 2026-11-06): the 8 / 10 / 15 day tenure steps are gone.
-- Still 0 before 12 completed months, prorated in the calendar year of the first anniversary, then 6.
-- Sick and personal rules are unchanged. Existing balances are re-synced right away.

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
    return round(round(30 * least(m, 12) / 12.0 * 2) / 2, 2);
  end if;

  if p_code = 'PERSONAL' then
    if extract(year from p_as_of)::int = extract(year from p_hire_date)::int then
      return round(round(6.0 * (12 - extract(month from p_hire_date)::int) / 12 * 2) / 2, 2);
    end if;
    return 6;
  end if;

  if m < 12 then
    return 0;
  end if;
  if extract(year from p_as_of)::int = extract(year from p_hire_date)::int + 1 then
    return round(round(6.0 * (12 - extract(month from p_hire_date)::int) / 12 * 2) / 2, 2);
  end if;
  return 6;
end;
$function$;

select public.sync_leave_entitlements();
