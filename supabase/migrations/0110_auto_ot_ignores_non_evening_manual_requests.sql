-- Bug found 2026-10-19 (Nat / Phai): the auto OT after the shift subtracted EVERY manual OT
-- request of the day, including ones that are not after-shift work at all (12:00-13:00 lunch
-- hour, 07:30-08:30 before the shift). Someone who logged 1 h over lunch and then stayed 2 h
-- after 18:00 got only 1 h auto OT (2 h - 1 h lunch request), so 2 h of real evening OT showed
-- as 1 h.
--
-- Now only the part of a manual request that falls AFTER the shift end counts as "already
-- requested" for the evening OT. Requests before the shift end (lunch, morning) stand on their
-- own. Overnight shifts / requests keep the old behaviour. The only change to the function is the
-- manual-minutes aggregate below; everything else is as in 0091.

create or replace function public.apply_auto_overtime(p attendance_records)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- Manual requests already covering the after-shift period. Only the part after the shift end
  -- counts; lunch-hour and morning requests are separate work.
  select coalesce(sum(m.after_minutes), 0)::integer,
         count(*) filter (where m.after_minutes > 0),
         max(m.end_time) filter (where m.after_minutes > 0)
    into v_manual_minutes, v_manual_count, v_manual_last_end
    from (
      select r.end_time,
             case
               when v_shift.end_time is null or v_shift.start_time is null
                    or v_shift.end_time <= v_shift.start_time or r.end_time < r.start_time
                 then round((case when r.status = 'approved' then coalesce(r.approved_hours, r.requested_hours) else r.requested_hours end) * 60)
               else least(
                 round((case when r.status = 'approved' then coalesce(r.approved_hours, r.requested_hours) else r.requested_hours end) * 60),
                 greatest(0, extract(epoch from (r.end_time - greatest(r.start_time, v_shift.end_time))) / 60)
               )
             end as after_minutes
        from overtime_requests r
        where r.employee_id = p.employee_id and r.work_date = p.work_date
          and r.status in ('pending', 'approved') and r.source <> 'auto_clock_out'
    ) m;

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
$function$;
