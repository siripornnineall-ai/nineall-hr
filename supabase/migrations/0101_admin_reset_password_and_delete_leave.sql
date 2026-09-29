-- Two HR tools requested 2026-09-29.
--
-- 1. admin_reset_login_password(): HR/super_admin sets a new temporary password for any
--    employee who forgot theirs (no email round-trip — same reasoning as 0039). The
--    employee is forced to change it at next login (must_change_password) and every
--    existing session of that account is signed out.
--
-- 2. delete_leave_request(): HR/super_admin removes a leave request outright (entered by
--    mistake, wrong person/date). Balances are put back the way apply_leave_decision()
--    would have left them without this request, the approval steps go with it, and any
--    attendance rows the approval auto-filled (leave / WFH / off-site placeholders without
--    a real scan) are removed so the day is judged fresh.

create or replace function public.admin_reset_login_password(p_employee_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_profile_id uuid;
begin
  if not is_admin_or_hr() then
    raise exception 'FORBIDDEN: only super_admin/hr can reset a password';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'PASSWORD_TOO_SHORT: password must be at least 8 characters';
  end if;

  select p.id into v_profile_id
    from profiles p join employees e on e.id = p.employee_id
    where p.employee_id = p_employee_id and e.org_id = current_org_id();
  if v_profile_id is null then
    raise exception 'NO_LOGIN_ACCOUNT: employee has no login account';
  end if;

  update auth.users
    set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
        updated_at = now()
    where id = v_profile_id;

  -- Sign the employee out everywhere so the old session can't keep going.
  delete from auth.sessions where user_id = v_profile_id;
  delete from auth.refresh_tokens where user_id = v_profile_id::text;

  update profiles set must_change_password = true where id = v_profile_id;

  insert into audit_logs (org_id, actor_profile_id, action, entity_type, entity_id, after_data)
  values (current_org_id(), auth.uid(), 'profiles.password_reset', 'profiles', v_profile_id, jsonb_build_object('employee_id', p_employee_id));
end;
$$;

revoke all on function public.admin_reset_login_password(uuid, text) from public;
grant execute on function public.admin_reset_login_password(uuid, text) to authenticated;

create or replace function public.delete_leave_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r leave_requests%rowtype;
  v_code text;
  v_year int;
  v_prev_trusted text;
begin
  if not is_admin_or_hr() then
    raise exception 'FORBIDDEN: only super_admin/hr can delete a leave request';
  end if;

  select * into r from leave_requests where id = p_request_id and org_id = current_org_id();
  if r.id is null then
    raise exception 'NOT_FOUND';
  end if;
  select code into v_code from leave_types where id = r.leave_type_id;
  v_year := extract(year from r.start_date);

  -- Give back whatever this request holds on the balance (WFH / off-site never reserve).
  if v_code not in ('WFH', 'OFFSITE') then
    if r.status = 'pending' then
      update leave_balances set pending_days = greatest(0, pending_days - r.total_days)
        where employee_id = r.employee_id and leave_type_id = r.leave_type_id and year = v_year;
    elsif r.status = 'approved' then
      update leave_balances set used_days = greatest(0, used_days - r.total_days)
        where employee_id = r.employee_id and leave_type_id = r.leave_type_id and year = v_year;
    end if;
  end if;

  -- Attendance rows the approval created: leave placeholders and WFH/off-site fills that
  -- have no real GPS scan behind them.
  if r.status = 'approved' then
    v_prev_trusted := current_setting('app.trusted_attendance_write', true);
    perform set_config('app.trusted_attendance_write', 'true', true);
    delete from attendance_records a
      where a.employee_id = r.employee_id
        and a.work_date between r.start_date and r.end_date
        and a.clock_in_latitude is null
        and (
          (a.status = 'leave' and a.clock_in_server_at is null)
          or (a.status in ('work_from_home', 'off_site') and v_code in ('WFH', 'OFFSITE'))
        );
    perform set_config('app.trusted_attendance_write', coalesce(v_prev_trusted, ''), true);
  end if;

  delete from approval_steps where request_type = 'leave' and request_id = r.id;

  -- Audit before the row disappears (the update-only audit trigger won't see a delete).
  insert into audit_logs (org_id, actor_profile_id, action, entity_type, entity_id, before_data)
  values (r.org_id, auth.uid(), 'leave_requests.delete', 'leave_requests', r.id, to_jsonb(r));

  -- The balance trigger (trg_leave_requests_decision) and the audit trigger are both
  -- "after update of status" only, so a delete doesn't fire them — the balance was
  -- handled above and the audit row written explicitly.
  delete from leave_requests where id = r.id;
end;
$$;

revoke all on function public.delete_leave_request(uuid) from public;
grant execute on function public.delete_leave_request(uuid) to authenticated;
