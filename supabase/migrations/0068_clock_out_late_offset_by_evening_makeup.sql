-- If an employee clocked in late this morning but stays past the normal shift end time in
-- the evening, offset the late minutes by however long they stayed past end (down to
-- zero, never turning into a credit) — e.g. shift 08:30, arrives 08:40 (10 min late,
-- shows "late"), stays until 18:10 on an 18:00 shift (10 min past end) fully cancels the
-- late mark back to on_time. Only applies when they leave at/after the normal end time
-- (the existing early_leave branch is unaffected) and only while status is still 'late'.
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
  v_shift_end time;
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

  if v_attendance.id is null then
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
    select end_time, grace_minutes_early_leave, unpaid_break_minutes, round_to_minutes
      into v_shift_end, v_grace_early, v_unpaid_break, v_round_to
      from work_shifts where id = v_attendance.shift_id;

    if v_shift_end is not null then
      declare
        v_minutes_early integer;
        v_minutes_after_end integer;
      begin
        v_minutes_early := greatest(0, round(extract(epoch from (
          v_shift_end - (p_device_at at time zone 'Asia/Bangkok')::time
        )) / 60))::integer;
        if v_minutes_early > coalesce(v_grace_early, 0) and v_status = 'on_time' then
          v_status := 'early_leave';
          v_early_leave_minutes := v_minutes_early - coalesce(v_grace_early, 0);
        elsif v_minutes_early = 0 and v_status = 'late' and v_late_minutes > 0 then
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
