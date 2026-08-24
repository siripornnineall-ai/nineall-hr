-- Fix: recording backdated "Work From Home" or "ทำงานนอกสถานที่" always failed with
-- INSUFFICIENT_LEAVE_BALANCE. Those two leave_types (WFH, OFFSITE) aren't real leave —
-- they reuse the leave_requests table purely so admins have a form to backdate an
-- attendance/location designation — but nobody has ever been granted an "entitlement"
-- of WFH/off-site days (that wouldn't mean anything), so their leave_balances always
-- show 0 available and the balance check rejected every request. Skip the
-- balance check entirely for these two types; leave the check as-is for everything else.

create or replace function public.validate_and_reserve_leave_balance()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_year int;
  v_available numeric;
  v_leave_code text;
begin
  select code into v_leave_code from leave_types where id = new.leave_type_id;
  if v_leave_code in ('WFH', 'OFFSITE') then
    return new;
  end if;

  v_year := extract(year from new.start_date);

  insert into leave_balances (employee_id, leave_type_id, year, entitled_days, used_days, pending_days)
  values (new.employee_id, new.leave_type_id, v_year, 0, 0, 0)
  on conflict (employee_id, leave_type_id, year) do nothing;

  select (entitled_days + carried_over_days - used_days - pending_days)
    into v_available
    from leave_balances
    where employee_id = new.employee_id and leave_type_id = new.leave_type_id and year = v_year
    for update;

  if v_available is not null and v_available < new.total_days then
    raise exception 'INSUFFICIENT_LEAVE_BALANCE: available % days, requested % days', v_available, new.total_days;
  end if;

  update leave_balances
    set pending_days = pending_days + new.total_days
    where employee_id = new.employee_id and leave_type_id = new.leave_type_id and year = v_year;

  return new;
end;
$$;
