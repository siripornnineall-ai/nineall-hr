-- Approved partial-day leave shifts the start/end the employee is judged against.
--
-- Cases from 2026-09-22/23: an employee with approved hourly sick leave 08:30-10:00 who
-- scanned in at 10:14 was marked 80 minutes late; another with approved half-day leave
-- 08:00-12:00 whose afternoon was entered as 13:00-18:00 was marked 234 minutes late. In
-- both, the late figure was measured from the shift start instead of from where the
-- leave ended — and in the first case the leave was only approved after the scan, so
-- nothing ever re-judged the day.
--
-- Model: for a date with approved leave that isn't the whole day, the employee's
-- "effective" window is the shift minus the leave. Leave that runs from the start of the
-- shift moves the start later (an end at 12:00-13:00 rolls to 13:00, past the lunch
-- break); leave that runs to the end of the shift moves the end earlier (a start at
-- 12:00-13:00 rolls back to 12:00). Half-day swaps keep their existing full exemption.
--
-- One function, rejudge_attendance_day(), now holds the late / early-leave / evening-
-- make-up rules and is used by:
--   * clock_in() and clock_out() (via effective_shift_window)
--   * a trigger that re-judges the day when such a leave becomes approved after the scan
--   * the admin-web time editor (called as an RPC after it writes the times)

create or replace function public.effective_shift_window(p_employee_id uuid, p_work_date date, p_shift_start time, p_shift_end time)
returns table (eff_start time, eff_end time)
language plpgsql stable security definer set search_path = public as $$
declare
  v_leave_start time;
  v_leave_end time;
  v_start time := p_shift_start;
  v_end time := p_shift_end;
begin
  -- Earliest start / latest end across approved partial-day leave covering the date.
  select min(coalesce(l.start_time, time '08:00')), max(coalesce(l.end_time, time '12:00'))
    into v_leave_start, v_leave_end
    from leave_requests l
    where l.employee_id = p_employee_id and l.status = 'approved'
      and p_work_date between l.start_date and l.end_date
      and (l.unit <> 'full_day' or l.total_days < 1);

  if v_leave_start is not null and p_shift_start is not null and p_shift_end is not null then
    -- Leave from (about) the start of the shift: the day starts when the leave ends.
    if v_leave_start <= p_shift_start + interval '30 minutes' and v_leave_end > p_shift_start then
      v_start := case when v_leave_end >= time '12:00' and v_leave_end <= time '13:00' then time '13:00' else v_leave_end end;
    end if;
    -- Leave to (about) the end of the shift: the day ends when the leave starts.
    if v_leave_end >= p_shift_end - interval '30 minutes' and v_leave_start < p_shift_end then
      v_end := case when v_leave_start >= time '12:00' and v_leave_start <= time '13:00' then time '12:00' else v_leave_start end;
    end if;
  end if;

  eff_start := v_start;
  eff_end := v_end;
  return next;
end;
$$;

-- Recomputes late / early-leave / status for one day from its clock times, shift,
-- effective window, approved half-day swaps and the evening make-up rule. Leaves special
-- statuses (leave, holiday, WFH, ...) alone. Returns the row.
create or replace function public.rejudge_attendance_day(p_attendance_id uuid)
returns attendance_records
language plpgsql security definer set search_path = public as $$
declare
  a attendance_records%rowtype;
  s work_shifts%rowtype;
  v_in time;
  v_out time;
  v_start time;
  v_end time;
  v_morning_off boolean := false;
  v_afternoon_off boolean := false;
  v_late integer := 0;
  v_early integer := 0;
  v_after_end integer := 0;
  v_status attendance_status;
  v_prev_trusted text;
begin
  select * into a from attendance_records where id = p_attendance_id;
  if a.id is null then
    raise exception 'NOT_FOUND';
  end if;
  if a.status not in ('on_time', 'late', 'early_leave') or a.clock_in_server_at is null or a.shift_id is null then
    return a;
  end if;
  select * into s from work_shifts where id = a.shift_id;
  if s.id is null or s.start_time is null or s.end_time is null then
    return a;
  end if;

  v_in := (a.clock_in_server_at at time zone 'Asia/Bangkok')::time;
  v_out := (a.clock_out_server_at at time zone 'Asia/Bangkok')::time;

  select eff_start, eff_end into v_start, v_end from effective_shift_window(a.employee_id, a.work_date, s.start_time, s.end_time);

  select exists (
    select 1 from day_off_swap_requests where employee_id = a.employee_id and substitute_date = a.work_date and status = 'approved' and unit = 'half_day' and period = 'morning'
    union all
    select 1 from holiday_swap_requests where employee_id = a.employee_id and substitute_date = a.work_date and status = 'approved' and unit = 'half_day' and period = 'morning'
  ) into v_morning_off;
  select exists (
    select 1 from day_off_swap_requests where employee_id = a.employee_id and substitute_date = a.work_date and status = 'approved' and unit = 'half_day' and period = 'afternoon'
    union all
    select 1 from holiday_swap_requests where employee_id = a.employee_id and substitute_date = a.work_date and status = 'approved' and unit = 'half_day' and period = 'afternoon'
  ) into v_afternoon_off;

  if not v_morning_off then
    v_late := greatest(0, round(extract(epoch from (v_in - v_start)) / 60))::integer;
    v_late := greatest(0, v_late - coalesce(s.grace_minutes_late, 0));
  end if;

  if v_out is not null and not v_afternoon_off then
    v_early := greatest(0, round(extract(epoch from (v_end - v_out)) / 60))::integer;
    v_early := greatest(0, v_early - coalesce(s.grace_minutes_early_leave, 0));
    -- Evening make-up (0068): time past the normal end cancels lateness minute for minute.
    if v_late > 0 and v_out >= s.end_time then
      v_after_end := greatest(0, round(extract(epoch from (v_out - s.end_time)) / 60))::integer;
      v_late := greatest(0, v_late - v_after_end);
    end if;
  end if;

  v_status := case when v_late > 0 then 'late' when v_early > 0 then 'early_leave' else 'on_time' end;

  if a.late_minutes is distinct from v_late or a.early_leave_minutes is distinct from v_early or a.status is distinct from v_status then
    v_prev_trusted := current_setting('app.trusted_attendance_write', true);
    perform set_config('app.trusted_attendance_write', 'true', true);
    update attendance_records set late_minutes = v_late, early_leave_minutes = v_early, status = v_status where id = a.id returning * into a;
    perform set_config('app.trusted_attendance_write', coalesce(v_prev_trusted, ''), true);
  end if;
  return a;
end;
$$;

grant execute on function public.rejudge_attendance_day(uuid) to authenticated;

-- clock_in(): judge lateness against the effective start.
create or replace function public.clock_in(p_device_at timestamp with time zone, p_latitude double precision, p_longitude double precision, p_accuracy_m double precision, p_selfie_path text default null::text, p_device_id text default null::text, p_work_location_id uuid default null::uuid, p_is_offline boolean default false)
returns attendance_records
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_employee_id uuid := current_employee_id();
  v_org_id uuid := current_org_id();
  v_work_date date := (p_device_at at time zone 'Asia/Bangkok')::date;
  v_existing_in timestamptz;
  v_shift_id uuid;
  v_assignment_location_id uuid;
  v_work_location_id uuid;
  v_is_wfh boolean := false;
  v_loc_lat double precision;
  v_loc_lng double precision;
  v_loc_radius integer;
  v_distance double precision;
  v_within_geofence boolean;
  v_shift_start time;
  v_shift_end time;
  v_eff_start time;
  v_grace_late integer;
  v_minutes_late integer := 0;
  v_status attendance_status := 'on_time';
  v_late_minutes integer := 0;
  v_needs_review boolean := false;
  v_review_note text;
  v_row attendance_records;
  v_on_approved_half_day_off boolean := false;
begin
  if v_employee_id is null then
    raise exception 'ไม่พบข้อมูลพนักงานสำหรับบัญชีนี้' using errcode = '42501';
  end if;

  select clock_in_server_at into v_existing_in from attendance_records
    where employee_id = v_employee_id and work_date = v_work_date;
  if v_existing_in is not null then
    raise exception 'คุณลงเวลาเข้างานของวันนี้ไปแล้ว' using errcode = '23505';
  end if;

  select shift_id, work_location_id, coalesce(is_work_from_home, false) into v_shift_id, v_assignment_location_id, v_is_wfh
    from shift_assignments
    where employee_id = v_employee_id and work_date = v_work_date
    limit 1;

  v_work_location_id := coalesce(v_assignment_location_id, p_work_location_id);

  if v_work_location_id is not null and not v_is_wfh then
    select latitude, longitude, radius_meters into v_loc_lat, v_loc_lng, v_loc_radius
      from work_locations where id = v_work_location_id;
    if v_loc_lat is not null then
      v_distance := geo_distance_meters(p_latitude, p_longitude, v_loc_lat, v_loc_lng);
      v_within_geofence := v_distance <= v_loc_radius;
    end if;
  end if;

  select exists (
    select 1 from day_off_swap_requests
      where employee_id = v_employee_id and substitute_date = v_work_date
        and status = 'approved' and unit = 'half_day' and period = 'morning'
    union all
    select 1 from holiday_swap_requests
      where employee_id = v_employee_id and substitute_date = v_work_date
        and status = 'approved' and unit = 'half_day' and period = 'morning'
  ) into v_on_approved_half_day_off;

  if v_is_wfh then
    v_status := 'work_from_home';
  elsif v_shift_id is not null and not v_on_approved_half_day_off then
    select start_time, end_time, grace_minutes_late into v_shift_start, v_shift_end, v_grace_late from work_shifts where id = v_shift_id;
    if v_shift_start is not null then
      select eff_start into v_eff_start from effective_shift_window(v_employee_id, v_work_date, v_shift_start, v_shift_end);
      v_minutes_late := greatest(0, round(extract(epoch from (
        (p_device_at at time zone 'Asia/Bangkok')::time - coalesce(v_eff_start, v_shift_start)
      )) / 60))::integer;
      if v_minutes_late > coalesce(v_grace_late, 0) then
        v_status := 'late';
        v_late_minutes := v_minutes_late - coalesce(v_grace_late, 0);
      end if;
    end if;
  end if;

  if v_within_geofence is false then
    v_needs_review := true;
    v_review_note := 'อยู่นอกพื้นที่ที่กำหนด (Geofence) ณ เวลาลงเวลาเข้างาน — ระยะห่างประมาณ ' || round(v_distance) || ' เมตร';
  end if;
  if p_is_offline then
    v_needs_review := true;
    v_review_note := coalesce(v_review_note || '; ', '') || 'บันทึกแบบออฟไลน์ รอตรวจสอบ';
  end if;

  perform allow_self_clock_action();

  insert into attendance_records (
    org_id, employee_id, work_date, shift_id, work_location_id,
    clock_in_device_at, clock_in_server_at, clock_in_latitude, clock_in_longitude,
    clock_in_accuracy_m, clock_in_distance_m, clock_in_within_geofence, clock_in_selfie_path,
    clock_in_device_id, clock_in_is_offline_submission,
    status, late_minutes, needs_review, review_note
  ) values (
    v_org_id, v_employee_id, v_work_date, v_shift_id, v_work_location_id,
    p_device_at, now(), p_latitude, p_longitude,
    p_accuracy_m, v_distance, v_within_geofence, p_selfie_path,
    p_device_id, p_is_offline,
    v_status, v_late_minutes, v_needs_review, v_review_note
  )
  on conflict (employee_id, work_date) do update set
    shift_id = coalesce(excluded.shift_id, attendance_records.shift_id),
    work_location_id = coalesce(excluded.work_location_id, attendance_records.work_location_id),
    clock_in_device_at = excluded.clock_in_device_at,
    clock_in_server_at = excluded.clock_in_server_at,
    clock_in_latitude = excluded.clock_in_latitude,
    clock_in_longitude = excluded.clock_in_longitude,
    clock_in_accuracy_m = excluded.clock_in_accuracy_m,
    clock_in_distance_m = excluded.clock_in_distance_m,
    clock_in_within_geofence = excluded.clock_in_within_geofence,
    clock_in_selfie_path = excluded.clock_in_selfie_path,
    clock_in_device_id = excluded.clock_in_device_id,
    clock_in_is_offline_submission = excluded.clock_in_is_offline_submission,
    clock_out_device_at = null,
    clock_out_server_at = null,
    status = excluded.status,
    late_minutes = excluded.late_minutes,
    early_leave_minutes = 0,
    worked_minutes = 0,
    ot_minutes = 0,
    needs_review = excluded.needs_review,
    review_note = excluded.review_note
  returning * into v_row;

  return v_row;
end;
$function$;

-- clock_out(): judge early leave against the effective end.
create or replace function public.clock_out(p_device_at timestamp with time zone, p_latitude double precision, p_longitude double precision, p_accuracy_m double precision, p_selfie_path text default null::text, p_device_id text default null::text, p_is_offline boolean default false)
returns attendance_records
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_employee_id uuid := current_employee_id();
  v_work_date date := (p_device_at at time zone 'Asia/Bangkok')::date;
  v_attendance attendance_records%rowtype;
  v_loc_lat double precision;
  v_loc_lng double precision;
  v_loc_radius integer;
  v_distance double precision;
  v_within_geofence boolean;
  v_shift_start time;
  v_shift_end time;
  v_eff_end time;
  v_grace_early integer;
  v_unpaid_break integer;
  v_round_to integer;
  v_break_minutes integer := 0;
  v_worked_minutes integer;
  v_early_leave_minutes integer := 0;
  v_late_minutes integer;
  v_status attendance_status;
  v_needs_review boolean := false;
  v_review_note text;
  v_row attendance_records;
  v_on_approved_half_day_off boolean := false;
begin
  if v_employee_id is null then
    raise exception 'ไม่พบข้อมูลพนักงานสำหรับบัญชีนี้' using errcode = '42501';
  end if;

  select * into v_attendance from attendance_records
    where employee_id = v_employee_id and work_date = v_work_date;

  if v_attendance.id is null or v_attendance.clock_in_server_at is null then
    raise exception 'ไม่พบรายการลงเวลาเข้างานของวันนี้ กรุณาลงเวลาเข้างานก่อน' using errcode = 'P0002';
  end if;
  if v_attendance.clock_out_server_at is not null then
    raise exception 'คุณลงเวลาออกงานของวันนี้ไปแล้ว' using errcode = '23505';
  end if;

  if v_attendance.work_location_id is not null then
    select latitude, longitude, radius_meters into v_loc_lat, v_loc_lng, v_loc_radius
      from work_locations where id = v_attendance.work_location_id;
    if v_loc_lat is not null then
      v_distance := geo_distance_meters(p_latitude, p_longitude, v_loc_lat, v_loc_lng);
      v_within_geofence := v_distance <= v_loc_radius;
    end if;
  end if;

  select coalesce(sum(extract(epoch from (break_end_at - break_start_at)) / 60), 0)::integer into v_break_minutes
    from break_records
    where attendance_id = v_attendance.id and is_paid = false and break_end_at is not null;

  v_worked_minutes := greatest(0, floor(extract(epoch from (p_device_at - v_attendance.clock_in_device_at)) / 60)::integer - v_break_minutes);

  v_status := v_attendance.status;
  v_late_minutes := coalesce(v_attendance.late_minutes, 0);

  select exists (
    select 1 from day_off_swap_requests
      where employee_id = v_employee_id and substitute_date = v_work_date
        and status = 'approved' and unit = 'half_day' and period = 'afternoon'
    union all
    select 1 from holiday_swap_requests
      where employee_id = v_employee_id and substitute_date = v_work_date
        and status = 'approved' and unit = 'half_day' and period = 'afternoon'
  ) into v_on_approved_half_day_off;

  if v_attendance.shift_id is not null and not v_on_approved_half_day_off then
    select start_time, end_time, grace_minutes_early_leave, unpaid_break_minutes, round_to_minutes
      into v_shift_start, v_shift_end, v_grace_early, v_unpaid_break, v_round_to
      from work_shifts where id = v_attendance.shift_id;

    if v_shift_end is not null then
      select eff_end into v_eff_end from effective_shift_window(v_employee_id, v_work_date, v_shift_start, v_shift_end);
      declare
        v_minutes_early integer;
        v_minutes_after_end integer;
      begin
        v_minutes_early := greatest(0, round(extract(epoch from (
          coalesce(v_eff_end, v_shift_end) - (p_device_at at time zone 'Asia/Bangkok')::time
        )) / 60))::integer;
        if v_minutes_early > coalesce(v_grace_early, 0) and v_status = 'on_time' then
          v_status := 'early_leave';
          v_early_leave_minutes := v_minutes_early - coalesce(v_grace_early, 0);
        elsif v_status = 'late' and v_late_minutes > 0 and (p_device_at at time zone 'Asia/Bangkok')::time >= v_shift_end then
          v_minutes_after_end := greatest(0, round(extract(epoch from (
            (p_device_at at time zone 'Asia/Bangkok')::time - v_shift_end
          )) / 60))::integer;
          v_late_minutes := greatest(0, v_late_minutes - v_minutes_after_end);
          if v_late_minutes = 0 then
            v_status := 'on_time';
          end if;
        end if;
      end;
    end if;

    if v_round_to > 1 then
      v_worked_minutes := (v_worked_minutes / v_round_to) * v_round_to;
    end if;
  end if;

  if v_within_geofence is false then
    v_needs_review := true;
    v_review_note := 'อยู่นอกพื้นที่ที่กำหนด (Geofence) ณ เวลาลงเวลาออกงาน — ระยะห่างประมาณ ' || round(v_distance) || ' เมตร';
  end if;
  if p_is_offline then
    v_needs_review := true;
    v_review_note := coalesce(v_review_note || '; ', '') || 'บันทึกแบบออฟไลน์ รอตรวจสอบ';
  end if;

  perform allow_self_clock_action();

  update attendance_records set
    clock_out_device_at = p_device_at,
    clock_out_server_at = now(),
    clock_out_latitude = p_latitude,
    clock_out_longitude = p_longitude,
    clock_out_accuracy_m = p_accuracy_m,
    clock_out_distance_m = v_distance,
    clock_out_within_geofence = v_within_geofence,
    clock_out_selfie_path = p_selfie_path,
    clock_out_device_id = p_device_id,
    clock_out_is_offline_submission = p_is_offline,
    worked_minutes = v_worked_minutes,
    early_leave_minutes = v_early_leave_minutes,
    late_minutes = v_late_minutes,
    status = v_status,
    needs_review = v_attendance.needs_review or v_needs_review,
    review_note = case when v_needs_review then coalesce(v_attendance.review_note || '; ', '') || v_review_note else v_attendance.review_note end
  where id = v_attendance.id
  returning * into v_row;

  return v_row;
end;
$function$;

-- Leave approved after the scan: re-judge the days it covers.
create or replace function public.rejudge_attendance_on_partial_leave_approval()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if new.status <> 'approved' or (tg_op = 'UPDATE' and old.status = 'approved') then
    return new;
  end if;
  if new.unit = 'full_day' and new.total_days >= 1 then
    return new;
  end if;
  for r in
    select id from attendance_records
      where employee_id = new.employee_id and work_date between new.start_date and new.end_date
        and clock_in_server_at is not null and status in ('on_time', 'late', 'early_leave')
  loop
    perform rejudge_attendance_day(r.id);
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_rejudge_attendance_partial_leave on leave_requests;
create trigger trg_rejudge_attendance_partial_leave
  after update of status on leave_requests
  for each row execute function rejudge_attendance_on_partial_leave_approval();
