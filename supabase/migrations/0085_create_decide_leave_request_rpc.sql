-- There was already a decide_leave_request(uuid, approval_status, text) function in the
-- database (not tracked in any migration file, and not called from anywhere in either app's
-- code — confirmed via a repo-wide search) — an older, simpler version that never grew the
-- attendance auto-fill logic below. Dropping it so the new signature below doesn't collide
-- with it as an ambiguous overload (PostgREST can't pick between two functions differing
-- only in one param's type when called with a plain string).
drop function if exists public.decide_leave_request(uuid, approval_status, text);

-- Shared leave-decision RPC so BOTH admin-web and employee-pwa can approve/reject a leave
-- request with identical behavior (status update, approval_steps close-out, and the
-- WFH/off-site/full-day/half-day attendance auto-fill) instead of duplicating this logic as
-- separate client-side JS in each app — a single Postgres source of truth avoids drift.
-- Mirrors apps/admin-web/src/app/(dashboard)/leave/actions.ts's decideLeaveRequest +
-- autoFillLeaveAttendance + fillOffsiteAttendanceForDate exactly.
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
  v_org_id uuid := current_org_id();
  v_caller_employee_id uuid := current_employee_id();
  v_employee_id uuid;
  v_leave_type_id uuid;
  v_start_date date;
  v_end_date date;
  v_unit text;
  v_start_time time;
  v_end_time time;
  v_leave_code text;
  v_offsite_status attendance_status;
  v_work_date date;
  v_shift_id uuid;
  v_work_location_id uuid;
  v_shift_start time;
  v_shift_end time;
  v_clock_in timestamptz;
  v_clock_out timestamptz;
  v_existing_id uuid;
  v_existing_clock_in timestamptz;
  v_existing_clock_out timestamptz;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'INVALID_DECISION';
  end if;

  select employee_id, leave_type_id, start_date, end_date, unit::text, start_time, end_time
  into v_employee_id, v_leave_type_id, v_start_date, v_end_date, v_unit, v_start_time, v_end_time
  from leave_requests
  where id = p_request_id and org_id = v_org_id;

  if v_employee_id is null then
    raise exception 'NOT_FOUND';
  end if;

  if not (is_admin_or_hr() or is_manager_of(v_employee_id)) then
    raise exception 'FORBIDDEN';
  end if;

  update leave_requests set status = p_decision::approval_status, updated_at = now()
  where id = p_request_id and org_id = v_org_id;

  update approval_steps
  set status = p_decision::approval_status, comment = p_comment, acted_at = now(), approver_employee_id = v_caller_employee_id
  where request_type = 'leave' and request_id = p_request_id and status = 'pending';

  if p_decision <> 'approved' then
    return;
  end if;

  select code into v_leave_code from leave_types where id = v_leave_type_id;
  v_offsite_status := case v_leave_code when 'WFH' then 'work_from_home'::attendance_status when 'OFFSITE' then 'off_site'::attendance_status else null end;

  v_work_date := v_start_date;
  while v_work_date <= v_end_date loop
    if v_offsite_status is not null then
      v_shift_start := null;
      v_shift_end := null;
      v_shift_id := null;
      v_work_location_id := null;

      if v_unit = 'full_day' then
        select shift_id, work_location_id into v_shift_id, v_work_location_id
        from shift_assignments where employee_id = v_employee_id and work_date = v_work_date;
        if v_shift_id is not null then
          select start_time, end_time into v_shift_start, v_shift_end from work_shifts where id = v_shift_id;
        end if;
      elsif v_start_time is not null and v_end_time is not null then
        v_shift_start := v_start_time;
        v_shift_end := v_end_time;
        select shift_id, work_location_id into v_shift_id, v_work_location_id
        from shift_assignments where employee_id = v_employee_id and work_date = v_work_date;
      end if;

      if v_shift_start is not null and v_shift_end is not null then
        v_clock_in := (v_work_date::text || ' ' || v_shift_start::text || '+07:00')::timestamptz;
        v_clock_out := (v_work_date::text || ' ' || v_shift_end::text || '+07:00')::timestamptz;

        select id, clock_in_server_at, clock_out_server_at into v_existing_id, v_existing_clock_in, v_existing_clock_out
        from attendance_records where employee_id = v_employee_id and work_date = v_work_date;

        if v_existing_clock_in is not null and v_existing_clock_out is not null then
          null; -- already has real clock-in/out, never overwrite
        elsif v_existing_clock_in is not null then
          update attendance_records
          set clock_out_server_at = v_clock_out, status = v_offsite_status,
            worked_minutes = greatest(0, round(extract(epoch from (v_clock_out - v_existing_clock_in)) / 60))
          where id = v_existing_id;
        else
          insert into attendance_records (org_id, employee_id, work_date, shift_id, work_location_id, clock_in_server_at, clock_out_server_at, status, late_minutes, early_leave_minutes, worked_minutes, needs_review)
          values (v_org_id, v_employee_id, v_work_date, v_shift_id, v_work_location_id, v_clock_in, v_clock_out, v_offsite_status, 0, 0, round(extract(epoch from (v_clock_out - v_clock_in)) / 60), false)
          on conflict (employee_id, work_date) do update set
            shift_id = excluded.shift_id, work_location_id = excluded.work_location_id,
            clock_in_server_at = excluded.clock_in_server_at, clock_out_server_at = excluded.clock_out_server_at,
            status = excluded.status, late_minutes = 0, early_leave_minutes = 0,
            worked_minutes = excluded.worked_minutes, needs_review = false;
        end if;
      end if;

    elsif v_unit = 'full_day' then
      insert into attendance_records (org_id, employee_id, work_date, shift_id, work_location_id, clock_in_server_at, clock_out_server_at, status, late_minutes, early_leave_minutes, worked_minutes, needs_review)
      values (v_org_id, v_employee_id, v_work_date, null, null, null, null, 'leave', 0, 0, 0, false)
      on conflict (employee_id, work_date) do update set
        shift_id = null, work_location_id = null, clock_in_server_at = null, clock_out_server_at = null,
        status = 'leave', late_minutes = 0, early_leave_minutes = 0, worked_minutes = 0, needs_review = false;

    else
      if not exists (select 1 from attendance_records where employee_id = v_employee_id and work_date = v_work_date) then
        insert into attendance_records (org_id, employee_id, work_date, shift_id, work_location_id, clock_in_server_at, clock_out_server_at, status, late_minutes, early_leave_minutes, worked_minutes, needs_review)
        values (v_org_id, v_employee_id, v_work_date, null, null, null, null, 'leave', 0, 0, 0, false);
      end if;
    end if;

    v_work_date := v_work_date + 1;
  end loop;
end;
$function$;

revoke all on function public.decide_leave_request(uuid, text, text) from public;
grant execute on function public.decide_leave_request(uuid, text, text) to authenticated;
