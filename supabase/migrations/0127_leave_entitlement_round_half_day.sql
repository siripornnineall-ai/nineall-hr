-- Leave entitlement is rounded to the nearest half day (owner 2026-10-29). Same rules as 0125/0126
-- (vacation only after 12 months), only the final rounding changes from 2 decimals to 0.5.

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
  return round(round(d * 2) / 2, 2);
end;
$$;
