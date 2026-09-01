-- Whenever an employee submits a leave request, notify their manager (direct
-- employees.manager_employee_id, falling back to the team's manager) and every active
-- HR/super_admin in the org — deduped so the manager doesn't get the same notification
-- twice if they also happen to hold an HR/super_admin role. Uses the existing (previously
-- unused) notifications table on the 'in_app' channel; apps/admin-web's Topbar bell reads
-- from it.
create or replace function public.notify_leave_request_submitted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_employee_name text;
  v_leave_type_name text;
  v_manager_profile_id uuid;
  v_title text;
  v_body text;
begin
  select coalesce(nickname, first_name) || ' ' || last_name into v_employee_name
    from employees where id = new.employee_id;
  select name_th into v_leave_type_name from leave_types where id = new.leave_type_id;

  v_title := 'มีคำขอลาใหม่รออนุมัติ';
  v_body := coalesce(v_employee_name, 'พนักงาน') || ' ขอ' || coalesce(v_leave_type_name, 'ลา') || ' ' || new.total_days || ' วัน';

  -- Direct manager first (employees.manager_employee_id), falling back to the team's
  -- manager — same resolution order as is_manager_of().
  select p.id into v_manager_profile_id
  from employees e
  left join teams t on t.id = e.team_id
  join profiles p on p.employee_id = coalesce(e.manager_employee_id, t.manager_employee_id)
  where e.id = new.employee_id
  limit 1;

  if v_manager_profile_id is not null then
    insert into notifications (org_id, profile_id, type, title, body, data, channel)
    values (new.org_id, v_manager_profile_id, 'leave_request_submitted', v_title, v_body,
      jsonb_build_object('leave_request_id', new.id, 'employee_id', new.employee_id), 'in_app');
  end if;

  -- Every active HR / super_admin in the org, minus the manager above if they're also one
  -- of those roles (avoids a duplicate notification).
  insert into notifications (org_id, profile_id, type, title, body, data, channel)
  select new.org_id, p.id, 'leave_request_submitted', v_title, v_body,
    jsonb_build_object('leave_request_id', new.id, 'employee_id', new.employee_id), 'in_app'
  from profiles p
  where p.org_id = new.org_id
    and p.role in ('hr', 'super_admin')
    and p.is_active
    and (v_manager_profile_id is null or p.id <> v_manager_profile_id);

  return new;
end;
$function$;

drop trigger if exists trg_notify_leave_request_submitted on leave_requests;
create trigger trg_notify_leave_request_submitted
  after insert on leave_requests
  for each row execute function notify_leave_request_submitted();
