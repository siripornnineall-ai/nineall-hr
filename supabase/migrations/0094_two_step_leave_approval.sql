-- Two-step leave approval: line manager first, then HR / admin.
--
-- Owner's rule (2026-09-18): a leave request goes to the employee's หัวหน้างาน first; only
-- after they approve does it reach HR/admin for the final approval.
--
-- Design notes
--   * leave_requests.status is deliberately left alone — it stays 'pending' through both
--     steps and only becomes 'approved'/'rejected' at the final decision. Everything keyed
--     on pending -> approved (leave balance reserve/convert in apply_leave_decision(), the
--     employee notification, attendance auto-fill, payroll, calendars, the backdated-leave
--     "insert pending then approve" hop) keeps working unchanged.
--   * The step is tracked in a new column, approval_stage: 'manager' -> 'hr' -> 'done'.
--   * "Line manager" means employees.manager_employee_id (falling back to the team's
--     manager). It does NOT depend on the login role: every real หัวหน้า here has role
--     'employee', so is_manager_of() (which requires role 'manager') never matched anyone.
--   * A request skips straight to the HR step when there is nobody who could act as
--     manager: no manager set, the manager has no active login, the manager is HR/admin
--     anyway (their one approval is final), or HR is entering the leave on someone's behalf.
--   * A manager's rejection is final. HR can still decide a request that is waiting on a
--     manager (absent manager, urgent case) — recorded on the approval step as a bypass.
--   * Managers read their queue through get_manager_leave_queue() (security definer), not
--     through RLS, because leave_requests_select / employees_select only open up for the
--     'manager' role.

alter table leave_requests
  add column if not exists approval_stage text not null default 'hr'
    check (approval_stage in ('manager', 'hr', 'done')),
  add column if not exists manager_decided_by uuid references employees(id) on delete set null,
  add column if not exists manager_decided_at timestamptz,
  add column if not exists manager_decision text check (manager_decision in ('approved', 'rejected')),
  add column if not exists manager_comment text;

-- Requests already in flight were submitted under the one-step flow (HR was notified,
-- the manager never was), so they stay with HR.
-- User triggers off for this one statement so the backfill doesn't bump updated_at or write
-- ~80 audit rows for a column that didn't exist a moment ago.
alter table leave_requests disable trigger user;
update leave_requests set approval_stage = 'done' where status <> 'pending';
alter table leave_requests enable trigger user;

-- ---------- who is my line manager / am I theirs ----------
create or replace function public.line_manager_of(p_employee_id uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(e.manager_employee_id, t.manager_employee_id)
    from employees e
    left join teams t on t.id = e.team_id
    where e.id = p_employee_id;
$$;

create or replace function public.is_line_manager_of(p_employee_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select current_employee_id() is not null
     and p_employee_id is distinct from current_employee_id()
     and line_manager_of(p_employee_id) = current_employee_id();
$$;

create or replace function public.is_line_manager()
returns boolean
language sql stable security definer set search_path = public as $$
  select current_employee_id() is not null and exists (
    select 1 from employees e
      left join teams t on t.id = e.team_id
      where e.deleted_at is null
        and e.id <> current_employee_id()
        and coalesce(e.manager_employee_id, t.manager_employee_id) = current_employee_id()
  );
$$;

grant execute on function public.is_line_manager_of(uuid) to authenticated;
grant execute on function public.is_line_manager() to authenticated;

-- ---------- stage on insert ----------
create or replace function public.set_leave_approval_stage()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_manager_id uuid;
  v_manager_can_act boolean := false;
begin
  if new.status <> 'pending' then
    new.approval_stage := 'done';
    return new;
  end if;

  v_manager_id := line_manager_of(new.employee_id);

  if v_manager_id is not null and v_manager_id <> new.employee_id then
    -- The manager must be able to log in, and must not be HR/admin (whose single approval
    -- is already the final one).
    select exists (
      select 1 from profiles p
        where p.employee_id = v_manager_id and p.is_active
          and p.role not in ('hr', 'super_admin')
    ) into v_manager_can_act;
  end if;

  -- HR entering leave on someone else's behalf (backdated leave) goes straight to HR.
  if v_manager_can_act and is_admin_or_hr() and new.employee_id is distinct from current_employee_id() then
    v_manager_can_act := false;
  end if;

  new.approval_stage := case when v_manager_can_act then 'manager' else 'hr' end;
  return new;
end;
$$;

drop trigger if exists trg_leave_requests_stage on leave_requests;
create trigger trg_leave_requests_stage
  before insert on leave_requests
  for each row execute function set_leave_approval_stage();

-- Any final status (HR decision, manager rejection, employee cancelling, or the not-yet-
-- redeployed admin page updating status directly) closes the stage.
create or replace function public.close_leave_approval_stage()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status <> 'pending' then
    new.approval_stage := 'done';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_leave_requests_close_stage on leave_requests;
create trigger trg_leave_requests_close_stage
  before update of status on leave_requests
  for each row execute function close_leave_approval_stage();

-- create_first_approval_step() (generic, shared with OT etc.) always writes a 'manager'
-- step. When the request starts at the HR step, relabel that row. Named to sort after
-- trg_leave_first_approval so it runs second.
create or replace function public.fix_leave_first_step_for_hr_stage()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.approval_stage = 'hr' then
    update approval_steps
      set approver_role = 'hr', approver_employee_id = null
      where request_type = 'leave' and request_id = new.id and step_order = 1 and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_leave_z_stage_step on leave_requests;
create trigger trg_leave_z_stage_step
  after insert on leave_requests
  for each row execute function fix_leave_first_step_for_hr_stage();

-- ---------- notifications on submit: manager OR HR, not both ----------
create or replace function public.notify_leave_request_submitted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_employee_name text;
  v_leave_type_name text;
  v_body text;
begin
  select coalesce(nickname, first_name) || ' ' || last_name into v_employee_name
    from employees where id = new.employee_id;
  select name_th into v_leave_type_name from leave_types where id = new.leave_type_id;
  v_body := coalesce(v_employee_name, 'พนักงาน') || ' ขอ' || coalesce(v_leave_type_name, 'ลา') || ' ' || new.total_days || ' วัน';

  if new.approval_stage = 'manager' then
    insert into notifications (org_id, profile_id, type, title, body, data, channel)
    select new.org_id, p.id, 'leave_request_submitted', 'มีคำขอลารอคุณอนุมัติ (หัวหน้างาน)', v_body,
      jsonb_build_object('leave_request_id', new.id, 'employee_id', new.employee_id, 'stage', 'manager'), 'in_app'
    from profiles p
    where p.employee_id = line_manager_of(new.employee_id) and p.is_active;
  else
    insert into notifications (org_id, profile_id, type, title, body, data, channel)
    select new.org_id, p.id, 'leave_request_submitted', 'มีคำขอลาใหม่รออนุมัติ', v_body,
      jsonb_build_object('leave_request_id', new.id, 'employee_id', new.employee_id, 'stage', 'hr'), 'in_app'
    from profiles p
    where p.org_id = new.org_id and p.role in ('hr', 'super_admin') and p.is_active;
  end if;

  return new;
end;
$function$;

-- ---------- the decision RPC ----------
-- The existing function (0085) becomes the internal "final decision" step, untouched:
-- it sets the status, closes the approval steps and auto-fills attendance.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'decide_leave_request'
  ) and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'finalize_leave_request_internal'
  ) then
    alter function public.decide_leave_request(uuid, text, text) rename to finalize_leave_request_internal;
  end if;
end $$;

revoke all on function public.finalize_leave_request_internal(uuid, text, text) from public, anon, authenticated;

create or replace function public.decide_leave_request(
  p_request_id uuid,
  p_decision text,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_req leave_requests%rowtype;
  v_me uuid := current_employee_id();
  v_employee_name text;
  v_manager_name text;
  v_leave_type_name text;
  v_body text;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'INVALID_DECISION';
  end if;

  select * into v_req from leave_requests where id = p_request_id and org_id = current_org_id();
  if v_req.id is null then
    raise exception 'NOT_FOUND';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'คำขอนี้ถูกดำเนินการไปแล้ว';
  end if;

  -- HR / admin: always the final decision.
  if is_admin_or_hr() then
    if v_req.approval_stage = 'manager' then
      update approval_steps
        set status = 'cancelled', comment = 'HR/แอดมินดำเนินการแทนหัวหน้า', acted_at = now()
        where request_type = 'leave' and request_id = p_request_id and step_order = 1 and status = 'pending';
      insert into approval_steps (org_id, request_type, request_id, step_order, approver_role, status)
      values (v_req.org_id, 'leave', p_request_id, 2, 'hr', 'pending');
    end if;
    perform finalize_leave_request_internal(p_request_id, p_decision, p_comment);
    return;
  end if;

  -- Otherwise the caller must be this employee's line manager, acting on the manager step.
  if not is_line_manager_of(v_req.employee_id) then
    raise exception 'FORBIDDEN';
  end if;
  if v_req.approval_stage <> 'manager' then
    raise exception 'คำขอนี้ผ่านขั้นหัวหน้าไปแล้ว รอ HR อนุมัติ';
  end if;

  update approval_steps
    set status = p_decision::approval_status, comment = p_comment, acted_at = now(), approver_employee_id = v_me
    where request_type = 'leave' and request_id = p_request_id and step_order = 1 and status = 'pending';

  if p_decision = 'rejected' then
    -- Final. The status change fires apply_leave_decision (releases the reserved days) and
    -- notify_leave_request_decided (tells the employee).
    update leave_requests
      set status = 'rejected', manager_decided_by = v_me, manager_decided_at = now(),
          manager_decision = 'rejected', manager_comment = p_comment
      where id = p_request_id;
    return;
  end if;

  update leave_requests
    set approval_stage = 'hr', manager_decided_by = v_me, manager_decided_at = now(),
        manager_decision = 'approved', manager_comment = p_comment
    where id = p_request_id;

  insert into approval_steps (org_id, request_type, request_id, step_order, approver_role, status)
  values (v_req.org_id, 'leave', p_request_id, 2, 'hr', 'pending');

  select coalesce(nickname, first_name) || ' ' || last_name into v_employee_name from employees where id = v_req.employee_id;
  select coalesce(nickname, first_name) into v_manager_name from employees where id = v_me;
  select name_th into v_leave_type_name from leave_types where id = v_req.leave_type_id;
  v_body := coalesce(v_employee_name, 'พนักงาน') || ' ขอ' || coalesce(v_leave_type_name, 'ลา') || ' ' || v_req.total_days
    || ' วัน — หัวหน้า (' || coalesce(v_manager_name, '-') || ') อนุมัติแล้ว';

  insert into notifications (org_id, profile_id, type, title, body, data, channel)
  select v_req.org_id, p.id, 'leave_request_submitted', 'คำขอลารอ HR อนุมัติ (หัวหน้าอนุมัติแล้ว)', v_body,
    jsonb_build_object('leave_request_id', p_request_id, 'employee_id', v_req.employee_id, 'stage', 'hr'), 'in_app'
  from profiles p
  where p.org_id = v_req.org_id and p.role in ('hr', 'super_admin') and p.is_active;

  insert into notifications (org_id, profile_id, type, title, body, data, channel)
  select v_req.org_id, p.id, 'leave_request_decided', 'หัวหน้าอนุมัติคำขอลาแล้ว รอ HR อนุมัติ',
    coalesce(v_leave_type_name, 'คำขอลา') || ' ' || v_req.total_days || ' วัน',
    jsonb_build_object('leave_request_id', p_request_id, 'stage', 'hr'), 'in_app'
  from profiles p
  where p.employee_id = v_req.employee_id and p.is_active;
end;
$function$;

revoke all on function public.decide_leave_request(uuid, text, text) from public;
grant execute on function public.decide_leave_request(uuid, text, text) to authenticated;

-- ---------- the manager's queue ----------
create or replace function public.get_manager_leave_queue()
returns table (
  id uuid,
  employee_code text,
  employee_name text,
  nickname text,
  leave_type_name text,
  start_date date,
  end_date date,
  unit text,
  start_time time,
  end_time time,
  total_days numeric,
  reason text,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select l.id, e.employee_code, e.first_name || ' ' || e.last_name, e.nickname, t.name_th,
         l.start_date, l.end_date, l.unit::text, l.start_time, l.end_time, l.total_days, l.reason, l.created_at
    from leave_requests l
    join employees e on e.id = l.employee_id
    join leave_types t on t.id = l.leave_type_id
    where l.org_id = current_org_id()
      and l.status = 'pending'
      and l.approval_stage = 'manager'
      and is_line_manager_of(l.employee_id)
    order by l.created_at;
$$;

grant execute on function public.get_manager_leave_queue() to authenticated;
