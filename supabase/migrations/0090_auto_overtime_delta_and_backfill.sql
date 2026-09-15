-- Rework of 0089's auto-OT so it copes with several OT requests on one day.
--
-- Real data showed employees filing 2-4 OT requests for the same evening (e.g. 18:00-19:00,
-- 19:00-20:00, 20:00-22:00). 0089 compared the clock-out against the *first* request only
-- and raised that one, which would have double-counted the rest. Now:
--   * the employee's own requests for the day are summed (pending + approved, non-auto)
--   * the auto row only ever holds the DIFFERENCE between actual minutes past shift end and
--     that sum — it is created/updated when the difference is positive and removed when it
--     is not; manual requests are never edited
--   * the same recompute also runs when a manual request is added, changed or deleted, so
--     the auto row shrinks/grows accordingly
--   * the core logic lives in apply_auto_overtime(attendance_records) so it can be run for
--     existing rows (backfill) without faking an update
-- Same thresholds/policy as 0089 (min 30 min, 30-min blocks, auto-approve; policy_settings
-- 'ot_auto' overrides).

create or replace function public.apply_auto_overtime(p attendance_records)
returns void
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
  v_manual_minutes integer := 0;
  v_manual_count integer := 0;
  v_manual_last_end time;
  v_delta_minutes integer := 0;
  v_hours numeric(5,2);
  v_start_time time;
  v_clock_out_local time;
  v_is_holiday boolean := false;
  v_rate_policy jsonb;
  v_rate numeric(4,2);
  v_auto overtime_requests%rowtype;
  v_half_day_afternoon_off boolean := false;
  v_new_id uuid;
  v_reason text;
  v_prev_trusted text;
begin
  if p.clock_out_server_at is not null
     and p.shift_id is not null
     and p.status in ('on_time', 'late', 'early_leave') then
    select * into v_shift from work_shifts where id = p.shift_id;

    if v_shift.id is not null and coalesce(v_shift.ot_after_shift_allowed, true) and v_shift.end_time is not null then
      select value into v_policy
        from policy_settings
        where org_id = p.org_id and setting_type = 'ot_auto' and effective_date <= current_date
        order by effective_date desc
        limit 1;
      if v_policy is not null then
        v_min_minutes := coalesce((v_policy->>'min_minutes')::integer, v_min_minutes);
        v_round_to := coalesce((v_policy->>'round_to_minutes')::integer, v_round_to);
        v_auto_approve := coalesce((v_policy->>'auto_approve')::boolean, v_auto_approve);
      end if;

      select exists (
        select 1 from day_off_swap_requests
          where employee_id = p.employee_id and substitute_date = p.work_date
            and status = 'approved' and unit = 'half_day' and period = 'afternoon'
        union all
        select 1 from holiday_swap_requests
          where employee_id = p.employee_id and substitute_date = p.work_date
            and status = 'approved' and unit = 'half_day' and period = 'afternoon'
      ) into v_half_day_afternoon_off;

      if not v_half_day_afternoon_off then
        v_shift_end_ts := (p.work_date + v_shift.end_time)::timestamp at time zone 'Asia/Bangkok';
        if v_shift.end_time <= v_shift.start_time then
          v_shift_end_ts := v_shift_end_ts + interval '1 day';
        end if;
        v_minutes_after := floor(extract(epoch from (p.clock_out_server_at - v_shift_end_ts)) / 60)::integer;
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

  if p.ot_minutes is distinct from v_ot_minutes then
    v_prev_trusted := current_setting('app.trusted_attendance_write', true);
    perform set_config('app.trusted_attendance_write', 'true', true);
    update attendance_records set ot_minutes = v_ot_minutes where id = p.id;
    perform set_config('app.trusted_attendance_write', coalesce(v_prev_trusted, ''), true);
  end if;

  -- What the employee (or HR) already asked for that day, all requests summed.
  select coalesce(sum(round((case when status = 'approved' then coalesce(approved_hours, requested_hours) else requested_hours end) * 60))::integer, 0),
         count(*), max(end_time)
    into v_manual_minutes, v_manual_count, v_manual_last_end
    from overtime_requests
    where employee_id = p.employee_id and work_date = p.work_date
      and status in ('pending', 'approved') and source <> 'auto_clock_out';

  v_delta_minutes := v_ot_minutes - v_manual_minutes;

  select * into v_auto from overtime_requests
    where attendance_id = p.id and source = 'auto_clock_out'
    limit 1;

  if v_delta_minutes <= 0 then
    if v_auto.id is not null and v_auto.status in ('pending', 'approved') then
      delete from approval_steps where request_type = 'overtime' and request_id = v_auto.id;
      delete from overtime_requests where id = v_auto.id;
    end if;
    return;
  end if;

  v_hours := round(v_delta_minutes / 60.0, 2);
  v_clock_out_local := (p.clock_out_server_at at time zone 'Asia/Bangkok')::time;
  v_start_time := case when v_manual_count > 0 and v_manual_last_end > v_shift.end_time then v_manual_last_end else v_shift.end_time end;
  v_reason := case
    when v_manual_count > 0 then
      'ระบบตัด OT ส่วนที่ทำเกินจากที่ขอ (ขอไว้ ' || round(v_manual_minutes / 60.0, 2) || ' ชม. ออกงานจริง ' || to_char(v_clock_out_local, 'HH24:MI') || ' = ' || round(v_ot_minutes / 60.0, 2) || ' ชม.)'
    else
      'ระบบตัด OT อัตโนมัติจากเวลาออกงาน ' || to_char(v_clock_out_local, 'HH24:MI') || ' (ไม่มีคำขอ OT)'
  end;

  select exists (select 1 from company_holidays where org_id = p.org_id and holiday_date = p.work_date) into v_is_holiday;
  select value into v_rate_policy
    from policy_settings
    where org_id = p.org_id and setting_type = 'ot_rate' and effective_date <= current_date
    order by effective_date desc
    limit 1;
  v_rate := coalesce((v_rate_policy->>(case when v_is_holiday then 'holiday' else 'normal' end))::numeric, 1);

  if v_auto.id is not null then
    if v_auto.status in ('pending', 'approved') then
      update overtime_requests set
        requested_hours = v_hours,
        approved_hours = case when status = 'approved' then v_hours else approved_hours end,
        start_time = v_start_time,
        end_time = v_clock_out_local,
        rate_multiplier = v_rate,
        reason = v_reason
      where id = v_auto.id;
    end if;
    return;
  end if;

  insert into overtime_requests (org_id, employee_id, work_date, start_time, end_time, requested_hours, rate_multiplier, reason, status, attendance_id, source)
  values (p.org_id, p.employee_id, p.work_date, v_start_time, v_clock_out_local, v_hours, v_rate, v_reason, 'pending', p.id, 'auto_clock_out')
  returning id into v_new_id;

  if v_auto_approve then
    update overtime_requests set status = 'approved', approved_hours = v_hours where id = v_new_id;
    update approval_steps
      set status = 'approved', comment = 'อนุมัติอัตโนมัติ (ระบบตัด OT จากเวลาออกงาน)', acted_at = now()
      where request_type = 'overtime' and request_id = v_new_id and status = 'pending';
  end if;
end;
$$;

-- The attendance trigger now just delegates.
create or replace function public.sync_auto_overtime_from_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform apply_auto_overtime(new);
  return new;
end;
$$;

-- Replace 0089's "drop the auto row when a manual request appears" with a full recompute
-- whenever a manual request is inserted, changed or deleted — so the auto row becomes the
-- remaining difference instead of vanishing.
drop trigger if exists trg_drop_auto_overtime_on_manual_request on overtime_requests;
drop function if exists public.drop_auto_overtime_on_manual_request();

create or replace function public.recompute_auto_overtime_for_manual_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row overtime_requests;
  v_att attendance_records%rowtype;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  if v_row.source = 'auto_clock_out' then
    return v_row;
  end if;
  select * into v_att from attendance_records
    where employee_id = v_row.employee_id and work_date = v_row.work_date;
  if v_att.id is not null then
    perform apply_auto_overtime(v_att);
  end if;
  return v_row;
end;
$$;

drop trigger if exists trg_recompute_auto_overtime_on_manual_request on overtime_requests;
create trigger trg_recompute_auto_overtime_on_manual_request
  after insert or update of status, requested_hours, approved_hours, work_date or delete on overtime_requests
  for each row
  execute function recompute_auto_overtime_for_manual_request();

-- Backfill for the current OT cutoff window (26 Aug - 25 Sep 2026), requested by the owner
-- on 2026-09-15. Earlier dates belong to the August payroll run and are left alone.
select apply_auto_overtime(a)
  from attendance_records a
  where a.clock_out_server_at is not null
    and a.work_date between '2026-08-26' and current_date;
