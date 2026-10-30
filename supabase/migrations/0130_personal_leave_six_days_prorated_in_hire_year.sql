-- Personal leave (owner 2026-10-30): 6 days a year from the first day of work (no 12-month wait, no 8/10/15
-- steps). In the calendar year of joining the 6 days are shared over the months left after the hire month
-- (joined in May = 7 months = 3.5 days), rounded to half days; every later year it is the full 6.
-- Vacation (0128) and sick leave (0125/0127) are unchanged. Replaces the personal branch of 0129.

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

  if p_code = 'PERSONAL' then
    if extract(year from p_as_of)::int = extract(year from p_hire_date)::int then
      return round(round(6.0 * (12 - extract(month from p_hire_date)::int) / 12 * 2) / 2, 2);
    end if;
    return 6;
  end if;

  -- vacation
  if m < 12 then
    return 0;
  end if;
  if extract(year from p_as_of)::int = extract(year from p_hire_date)::int + 1 then
    return round(round(6.0 * (12 - extract(month from p_hire_date)::int) / 12 * 2) / 2, 2);
  end if;
  return case when m >= 84 then 15 when m >= 48 then 10 when m >= 24 then 8 else 6 end;
end;
$$;
