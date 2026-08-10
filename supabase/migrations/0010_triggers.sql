-- Nineall HR — business-rule triggers
-- These enforce invariants at the database layer so they hold even if a client
-- bypasses the app (defense in depth on top of RLS + Edge Functions).

-- ---------- generic audit log ----------
create or replace function write_audit_log()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  v_action text;
begin
  v_action := lower(TG_TABLE_NAME) || '.' || lower(TG_OP);
  if TG_OP = 'DELETE' then
    v_org_id := old.org_id;
  else
    v_org_id := new.org_id;
  end if;

  insert into audit_logs (org_id, actor_profile_id, action, entity_type, entity_id, before_data, after_data)
  values (
    v_org_id,
    auth.uid(),
    v_action,
    TG_TABLE_NAME,
    coalesce(case when TG_OP = 'DELETE' then old.id else new.id end, null),
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

create trigger trg_audit_employees after insert or update or delete on employees
  for each row execute function write_audit_log();
create trigger trg_audit_attendance after update on attendance_records
  for each row execute function write_audit_log();
create trigger trg_audit_leave_requests after update on leave_requests
  for each row execute function write_audit_log();
create trigger trg_audit_overtime_requests after update on overtime_requests
  for each row execute function write_audit_log();
create trigger trg_audit_payroll_runs after update on payroll_runs
  for each row execute function write_audit_log();
create trigger trg_audit_profiles after update on profiles
  for each row execute function write_audit_log();

-- ---------- leave: validate balance on submit, auto-adjust on decision ----------
create or replace function validate_and_reserve_leave_balance()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_year int;
  v_available numeric;
begin
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
create trigger trg_leave_requests_reserve before insert on leave_requests
  for each row execute function validate_and_reserve_leave_balance();

create or replace function apply_leave_decision()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_year int;
begin
  if new.status = old.status then
    return new;
  end if;
  v_year := extract(year from new.start_date);

  if old.status = 'pending' and new.status = 'approved' then
    update leave_balances
      set pending_days = pending_days - new.total_days,
          used_days = used_days + new.total_days
      where employee_id = new.employee_id and leave_type_id = new.leave_type_id and year = v_year;
  elsif old.status = 'pending' and new.status in ('rejected', 'cancelled') then
    update leave_balances
      set pending_days = pending_days - new.total_days
      where employee_id = new.employee_id and leave_type_id = new.leave_type_id and year = v_year;
  elsif old.status = 'approved' and new.status = 'cancelled' then
    update leave_balances
      set used_days = used_days - new.total_days
      where employee_id = new.employee_id and leave_type_id = new.leave_type_id and year = v_year;
  end if;

  return new;
end;
$$;
create trigger trg_leave_requests_decision after update of status on leave_requests
  for each row execute function apply_leave_decision();

-- ---------- auto-create the first approval step (the requester's manager) ----------
create or replace function create_first_approval_step()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_manager_id uuid;
  v_request_type text;
begin
  v_request_type := TG_ARGV[0];

  select coalesce(t.manager_employee_id, e.manager_employee_id)
    into v_manager_id
    from employees e
    left join teams t on t.id = e.team_id
    where e.id = new.employee_id;

  insert into approval_steps (org_id, request_type, request_id, step_order, approver_role, approver_employee_id, status)
  values (new.org_id, v_request_type, new.id, 1, 'manager', v_manager_id, 'pending');

  return new;
end;
$$;
create trigger trg_leave_first_approval after insert on leave_requests
  for each row execute function create_first_approval_step('leave');
create trigger trg_overtime_first_approval after insert on overtime_requests
  for each row execute function create_first_approval_step('overtime');
create trigger trg_time_correction_first_approval after insert on time_correction_requests
  for each row execute function create_first_approval_step('time_correction');

-- ---------- payroll: once a run is locked, calculations are frozen ----------
create or replace function block_locked_payroll_edit()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_status payroll_run_status;
begin
  select status into v_status from payroll_runs where id = new.payroll_run_id;
  if v_status = 'locked' then
    raise exception 'PAYROLL_LOCKED: use payroll_adjustments to change a locked calculation';
  end if;
  return new;
end;
$$;
create trigger trg_block_locked_payroll_edit before update on payroll_employee_calculations
  for each row execute function block_locked_payroll_edit();

-- ---------- overtime: only approved hours are payable, enforced by view used elsewhere ----------
create or replace function default_approved_ot_hours()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'approved' and new.approved_hours is null then
    new.approved_hours := new.requested_hours;
  end if;
  return new;
end;
$$;
create trigger trg_overtime_default_approved before update of status on overtime_requests
  for each row execute function default_approved_ot_hours();
