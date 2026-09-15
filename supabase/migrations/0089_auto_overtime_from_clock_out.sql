-- Auto-cut OT from clock-out time.
--
-- Before this, OT only existed if someone typed a request: an employee who stayed until
-- 20:00 on an 18:00 shift without asking got nothing, and one who requested 1 hour but
-- worked 2 still only got 1. The owner wants the real clock-out to win in both cases.
--
-- Implemented as a trigger on attendance_records (not inside clock_out()) so it also covers
-- HR editing a clock-out time on the Attendance page and backdated entries. Rules:
--   * only for worked statuses (on_time / late / early_leave) with a shift that allows
--     after-shift OT, and not on an approved afternoon half-day-off (that's a swap, not OT)
--   * minutes past shift end must reach `min_minutes` (default 30) and are floored to
--     `round_to_minutes` blocks (default 30) — both overridable per org via a
--     policy_settings row of setting_type 'ot_auto', e.g.
--     {"min_minutes": 30, "round_to_minutes": 30, "auto_approve": true}
--   * no OT request for that day  -> create one (source 'auto_clock_out', linked via
--     attendance_id) and auto-approve it unless auto_approve is false
--   * an existing pending/approved request for that day -> raise its hours up to the
--     actual amount if the employee worked more than they asked for (never lowered — HR
--     decides that)
--   * clock-out edited back below the threshold -> the auto row is removed again
-- attendance_records.ot_minutes is kept in sync so the Attendance page's "OT (นาที)"
-- column shows the same figure.

alter table overtime_requests
  add column if not exists source text not null default 'request'
    check (source in ('request', 'admin', 'auto_clock_out'));

create index if not exists idx_overtime_requests_attendance on overtime_requests(attendance_id) where attendance_id is not null;

create or replace function public.sync_auto_overtime_from_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift work_shifts%rowtype;
  v_policy jsonb;
  v_min_minutes integer := 30;
  v_round_to integer := 30;
  v_auto_approve boolean := true;
  v_shift_end_ts timestamptz;
  v_minutes_after integer := 0;
  v_ot_minutes integer := 0;
  v_hours numeric(5,2);
  v_clock_out_local time;
  v_is_holiday boolean := false;
  v_rate_policy jsonb;
  v_rate numeric(4,2);
  v_auto overtime_requests%rowtype;
  v_manual overtime_requests%rowtype;
  v_manual_hours numeric(5,2);
  v_half_day_afternoon_off boolean := false;
  v_new_id uuid;
  v_prev_trusted text;
begin
  if new.clock_out_server_at is not null
     and new.shift_id is not null
     and new.status in ('on_time', 'late', 'early_leave') then
    select * into v_shift from work_shifts where id = new.shift_id;

    if v_shift.id is not null and coalesce(v_shift.ot_after_shift_allowed, true) and v_shift.end_time is not null then
      select value into v_policy
        from policy_settings
        where org_id = new.org_id and setting_type = 'ot_auto' and effective_date <= current_date
        order by effective_date desc
        limit 1;
      if v_policy is not null then
        v_min_minutes := coalesce((v_policy->>'min_minutes')::integer, v_min_minutes);
        v_round_to := coalesce((v_policy->>'round_to_minutes')::integer, v_round_to);
        v_auto_approve := coalesce((v_policy->>'auto_approve')::boolean, v_auto_approve);
      end if;

      select exists (
        select 1 from day_off_swap_requests
          where employee_id = new.employee_id and substitute_date = new.work_date
            and status = 'approved' and unit = 'half_day' and period = 'afternoon'
        union all
        select 1 from holiday_swap_requests
          where employee_id = new.employee_id and substitute_date = new.work_date
            and status = 'approved' and unit = 'half_day' and period = 'afternoon'
      ) into v_half_day_afternoon_off;

      if not v_half_day_afternoon_off then
        v_shift_end_ts := (new.work_date + v_shift.end_time)::timestamp at time zone 'Asia/Bangkok';
        -- Derive "ends next day" from the times themselves rather than trusting is_overnight:
        -- the seeded 08:30-17:30 shift has the flag set by mistake.
        if v_shift.end_time <= v_shift.start_time then
          v_shift_end_ts := v_shift_end_ts + interval '1 day';
        end if;
        v_minutes_after := floor(extract(epoch from (new.clock_out_server_at - v_shift_end_ts)) / 60)::integer;
        if v_minutes_after >= v_min_minutes then
          if v_round_to > 1 then
            v_ot_minutes := (v_minutes_after / v_round_to) * v_round_to;
          else
            v_ot_minutes := v_minutes_after;
          end if;
        end if;
      end if;
    end if;
  end if;

  -- Keep the display column in step. This nested update only touches ot_minutes, so the
  -- "update of clock_out_server_at, shift_id, status" trigger below does not re-fire.
  -- restrict_attendance_self_update() blocks ot_minutes changes unless the caller is HR or
  -- a trusted write is flagged — flag it for just this statement, then put the flag back.
  if new.ot_minutes is distinct from v_ot_minutes then
    v_prev_trusted := current_setting('app.trusted_attendance_write', true);
    perform set_config('app.trusted_attendance_write', 'true', true);
    update attendance_records set ot_minutes = v_ot_minutes where id = new.id;
    perform set_config('app.trusted_attendance_write', coalesce(v_prev_trusted, ''), true);
  end if;

  select * into v_auto from overtime_requests
    where attendance_id = new.id and source = 'auto_clock_out'
    limit 1;
  select * into v_manual from overtime_requests
    where employee_id = new.employee_id and work_date = new.work_date
      and status in ('pending', 'approved') and source <> 'auto_clock_out'
    order by created_at
    limit 1;

  if v_ot_minutes = 0 or v_manual.id is not null then
    -- Nothing to auto-cut (or the employee's own request supersedes it): drop a stale auto
    -- row, but leave one HR already rejected/cancelled alone.
    if v_auto.id is not null and v_auto.status in ('pending', 'approved') then
      delete from approval_steps where request_type = 'overtime' and request_id = v_auto.id;
      delete from overtime_requests where id = v_auto.id;
    end if;
  end if;

  if v_ot_minutes = 0 then
    return new;
  end if;

  v_hours := round(v_ot_minutes / 60.0, 2);
  v_clock_out_local := (new.clock_out_server_at at time zone 'Asia/Bangkok')::time;

  if v_manual.id is not null then
    v_manual_hours := case when v_manual.status = 'approved' then coalesce(v_manual.approved_hours, v_manual.requested_hours) else v_manual.requested_hours end;
    if v_hours > v_manual_hours then
      update overtime_requests set
        requested_hours = greatest(requested_hours, v_hours),
        approved_hours = case when status = 'approved' then v_hours else approved_hours end,
        end_time = greatest(end_time, v_clock_out_local),
        reason = trim(regexp_replace(coalesce(reason, ''), '\s*\[ระบบปรับเพิ่มตาม[^\]]*\]', '', 'g'))
                 || ' [ระบบปรับเพิ่มตามเวลาออกงานจริง ' || to_char(v_clock_out_local, 'HH24:MI') || ' จากที่ขอ ' || v_manual_hours || ' ชม.]'
      where id = v_manual.id;
    end if;
    return new;
  end if;

  select exists (select 1 from company_holidays where org_id = new.org_id and holiday_date = new.work_date) into v_is_holiday;
  select value into v_rate_policy
    from policy_settings
    where org_id = new.org_id and setting_type = 'ot_rate' and effective_date <= current_date
    order by effective_date desc
    limit 1;
  v_rate := coalesce((v_rate_policy->>(case when v_is_holiday then 'holiday' else 'normal' end))::numeric, 1);

  if v_auto.id is not null then
    if v_auto.status in ('pending', 'approved') then
      update overtime_requests set
        requested_hours = v_hours,
        approved_hours = case when status = 'approved' then v_hours else approved_hours end,
        end_time = v_clock_out_local,
        rate_multiplier = v_rate
      where id = v_auto.id;
    end if;
    return new;
  end if;

  -- Insert as pending first so trg_overtime_first_approval creates the approval_steps row,
  -- then approve — same reason createBackdatedOvertimeAction does it in two steps.
  insert into overtime_requests (org_id, employee_id, work_date, start_time, end_time, requested_hours, rate_multiplier, reason, status, attendance_id, source)
  values (new.org_id, new.employee_id, new.work_date, v_shift.end_time, v_clock_out_local, v_hours, v_rate,
          'ระบบตัด OT อัตโนมัติจากเวลาออกงาน ' || to_char(v_clock_out_local, 'HH24:MI') || ' (ไม่มีคำขอ OT)',
          'pending', new.id, 'auto_clock_out')
  returning id into v_new_id;

  if v_auto_approve then
    update overtime_requests set status = 'approved', approved_hours = v_hours where id = v_new_id;
    update approval_steps
      set status = 'approved', comment = 'อนุมัติอัตโนมัติ (ระบบตัด OT จากเวลาออกงาน)', acted_at = now()
      where request_type = 'overtime' and request_id = v_new_id and status = 'pending';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_auto_overtime_insert on attendance_records;
create trigger trg_auto_overtime_insert
  after insert on attendance_records
  for each row
  when (new.clock_out_server_at is not null)
  execute function sync_auto_overtime_from_attendance();

drop trigger if exists trg_auto_overtime_update on attendance_records;
create trigger trg_auto_overtime_update
  after update of clock_out_server_at, shift_id, status on attendance_records
  for each row
  when (old.clock_out_server_at is distinct from new.clock_out_server_at
        or old.shift_id is distinct from new.shift_id
        or old.status is distinct from new.status)
  execute function sync_auto_overtime_from_attendance();

-- If the employee (or HR) files a real OT request for a day that already has an auto-cut
-- row, the request supersedes it — otherwise approving the request would pay the day twice.
create or replace function public.drop_auto_overtime_on_manual_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from approval_steps where request_type = 'overtime'
    and request_id in (
      select id from overtime_requests
        where employee_id = new.employee_id and work_date = new.work_date
          and source = 'auto_clock_out' and id <> new.id
    );
  delete from overtime_requests
    where employee_id = new.employee_id and work_date = new.work_date
      and source = 'auto_clock_out' and id <> new.id;
  return new;
end;
$$;

drop trigger if exists trg_drop_auto_overtime_on_manual_request on overtime_requests;
create trigger trg_drop_auto_overtime_on_manual_request
  after insert on overtime_requests
  for each row
  when (new.source <> 'auto_clock_out')
  execute function drop_auto_overtime_on_manual_request();

-- Auto rows point at their attendance record; when HR deletes the attendance record the
-- FK is "on delete set null", which would leave an orphan approved OT. Clean it up.
create or replace function public.delete_auto_overtime_on_attendance_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from approval_steps where request_type = 'overtime'
    and request_id in (select id from overtime_requests where attendance_id = old.id and source = 'auto_clock_out');
  delete from overtime_requests where attendance_id = old.id and source = 'auto_clock_out';
  return old;
end;
$$;

drop trigger if exists trg_auto_overtime_attendance_delete on attendance_records;
create trigger trg_auto_overtime_attendance_delete
  before delete on attendance_records
  for each row
  execute function delete_auto_overtime_on_attendance_delete();
