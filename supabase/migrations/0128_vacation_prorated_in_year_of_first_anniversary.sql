-- Vacation (owner 2026-10-30): nothing before 12 months of service. In the calendar year the person completes
-- 12 months, the 6 days are shared over the months left in that year after the anniversary month
-- (anniversary in July = 5 months = 6 x 5/12 = 2.5 days; in October = 2 months = 1 day). From the next calendar
-- year on, the full tier of the current tenure applies: 12 months = 6, 24 = 8, 48 = 10, 84 = 15 (no month by
-- month climbing). Rounded to the nearest half day. Sick and personal leave are unchanged (0125/0127).

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
    return round(round(30 * least(m, 12) / 12.0 * 2) / 2, 2);
  end if;

  if p_code = 'VACATION' then
    if m < 12 then
      return 0;
    end if;
    if extract(year from p_as_of)::int = extract(year from p_hire_date)::int + 1 then
      -- year of the first anniversary: share the 6 days over the months left in the year
      return round(round(6.0 * (12 - extract(month from p_hire_date)::int) / 12 * 2) / 2, 2);
    end if;
    return case when m >= 84 then 15 when m >= 48 then 10 when m >= 24 then 8 else 6 end;
  end if;

  -- personal leave: grows month by month along the same ladder
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
  return round(round(d * 2) / 2, 2);
end;
$$;
