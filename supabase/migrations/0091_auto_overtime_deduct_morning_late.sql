-- Auto-OT now nets off the morning's lateness first.
--
-- Owner's rule (2026-09-16): if someone arrived 20 minutes late and stayed 50 minutes past
-- shift end, the first 20 minutes past end just make up the late arrival — only the
-- remaining 30 count towards OT. The late figure is re-derived here from the clock-in time
-- against the shift start (same maths as clock_in(): minutes past start, less
-- grace_minutes_late) rather than read from attendance_records.late_minutes, because
-- clock_out() already offsets that column by the evening minutes (0068) — after clock-out
-- it no longer says how late the person actually was. An approved morning half-day off
-- means there was no morning to be late for, so nothing is deducted then.
-- Everything else is unchanged from 0090.

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
  v_late_raw integer := 0;
  v_net_minutes integer := 0;
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
  v_half_day_morning_off boolean := false;
  v_new_id uuid;
  v_reason text;
  v_late_note text := '';
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

      select exists (
        select 1 from day_off_swap_requests
          where employee_id = p.employee_id and substitute_date = p.work_date
            and status = 'approved' and unit = 'half_day' and period = 'morning'
        union all
        select 1 from holiday_swap_requests
          where employee_id = p.employee_id and substitute_date = p.work_date
            and status = 'approved' and unit = 'half_day' and period = 'morning'
      ) into v_half_day_morning_off;

      if not v_half_day_afternoon_off then
        v_shift_end_ts := (p.work_date + v_shift.end_time)::timestamp at time zone 'Asia/Bangkok';
        if v_shift.end_time <= v_shift.start_time then
          v_shift_end_ts := v_shift_end_ts + interval '1 day';
        end if;
        v_minutes_after := floor(extract(epoch from (p.clock_out_server_at - v_shift_end_ts)) / 60)::integer;

        -- Morning lateness, derived the same way clock_in() does it.
        if p.clock_in_server_at is not null and v_shift.start_time is not null and not v_half_day_morning_off then
          v_late_raw := greatest(0, round(extract(epoch from (
            (p.clock_in_server_at at time zone 'Asia/Bangkok')::time - v_shift.start_time
          )) / 60))::integer;
          v_late_raw := greatest(0, v_late_raw - coalesce(v_shift.grace_minutes_late, 0));
        end if;

        v_net_minutes := greatest(0, v_minutes_after - v_late_raw);
        if v_net_minutes >= v_min_minutes then
          if v_round_to > 1 then
            v_ot_minutes := (v_net_minutes / v_round_to) * v_round_to;
          else
            v_ot_minutes := v_net_minutes;
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
  if v_late_raw > 0 then
    v_late_note := ' หักมาสาย ' || v_late_raw || ' นาที';
  end if;
  v_reason := case
    when v_manual_count > 0 then
      'ระบบตัด OT ส่วนที่ทำเกินจากที่ขอ (ขอไว้ ' || round(v_manual_minutes / 60.0, 2) || ' ชม. ออกงานจริง ' || to_char(v_clock_out_local, 'HH24:MI') || v_late_note || ' = ' || round(v_ot_minutes / 60.0, 2) || ' ชม.)'
    else
      'ระบบตัด OT อัตโนมัติจากเวลาออกงาน ' || to_char(v_clock_out_local, 'HH24:MI') || v_late_note || ' (ไม่มีคำขอ OT)'
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

-- Re-run over the current cutoff window so the rows backfilled by 0090 get the late
-- deduction applied too (the function is idempotent).
select apply_auto_overtime(a)
  from attendance_records a
  where a.clock_out_server_at is not null
    and a.work_date between '2026-08-26' and current_date;
