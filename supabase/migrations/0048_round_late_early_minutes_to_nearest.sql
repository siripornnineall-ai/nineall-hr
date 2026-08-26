-- clock_in()/clock_out() used floor() when converting the clock-in/out vs shift-time gap
-- into whole minutes for late/early-leave. floor() truncates seconds, so two clock-ins
-- 30 seconds apart (e.g. 09:05:59 vs 09:06:29, both against a 09:00 shift + 5-min grace)
-- could land on opposite sides of the grace threshold (5 min vs 6 min) even though the
-- real-world difference is trivial. Switching to round() keeps the same grace-period
-- logic but resolves the boundary the way a human reading the clock would.

create or replace function public.clock_in(p_device_at timestamp with time zone, p_latitude double precision, p_longitude double precision, p_accuracy_m double precision, p_selfie_path text, p_device_id text default null::text, p_work_location_id uuid default null::uuid, p_is_offline boolean default false)
 returns attendance_records
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_employee_id uuid := current_employee_id();
  v_org_id uuid := current_org_id();
  v_work_date date := (p_device_at at time zone 'Asia/Bangkok')::date;
  v_existing_id uuid;
  v_shift_id uuid;
  v_assignment_location_id uuid;
  v_work_location_id uuid;
  v_loc_lat double precision;
  v_loc_lng double precision;
  v_loc_radius integer;
  v_distance double precision;
  v_within_geofence boolean;
  v_shift_start time;
  v_grace_late integer;
  v_minutes_late integer := 0;
  v_status attendance_status := 'on_time';
  v_late_minutes integer := 0;
  v_needs_review boolean := false;
  v_review_note text;
  v_row attendance_records;
begin
  if v_employee_id is null then
    raise exception 'ไม่พบข้อมูลพนักงานสำหรับบัญชีนี้' using errcode = '42501';
  end if;

  select id into v_existing_id from attendance_records
    where employee_id = v_employee_id and work_date = v_work_date;
  if v_existing_id is not null then
    raise exception 'คุณลงเวลาเข้างานของวันนี้ไปแล้ว' using errcode = '23505';
  end if;

  select shift_id, work_location_id into v_shift_id, v_assignment_location_id
    from shift_assignments
    where employee_id = v_employee_id and work_date = v_work_date
    limit 1;

  v_work_location_id := coalesce(v_assignment_location_id, p_work_location_id);

  if v_work_location_id is not null then
    select latitude, longitude, radius_meters into v_loc_lat, v_loc_lng, v_loc_radius
      from work_locations where id = v_work_location_id;
    if v_loc_lat is not null then
      v_distance := geo_distance_meters(p_latitude, p_longitude, v_loc_lat, v_loc_lng);
      v_within_geofence := v_distance <= v_loc_radius;
    end if;
  end if;

  if v_shift_id is not null then
    select start_time, grace_minutes_late into v_shift_start, v_grace_late from work_shifts where id = v_shift_id;
    if v_shift_start is not null then
      v_minutes_late := greatest(0, round(extract(epoch from (
        (p_device_at at time zone 'Asia/Bangkok')::time - v_shift_start
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
  returning * into v_row;

  return v_row;
end;
$function$;

create or replace function public.clock_out(p_device_at timestamp with time zone, p_latitude double precision, p_longitude double precision, p_accuracy_m double precision, p_selfie_path text, p_device_id text default null::text, p_is_offline boolean default false)
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
  v_status attendance_status;
  v_needs_review boolean := false;
  v_review_note text;
  v_row attendance_records;
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

  if v_attendance.shift_id is not null then
    select end_time, grace_minutes_early_leave, unpaid_break_minutes, round_to_minutes
      into v_shift_end, v_grace_early, v_unpaid_break, v_round_to
      from work_shifts where id = v_attendance.shift_id;

    if v_shift_end is not null then
      declare
        v_minutes_early integer;
      begin
        v_minutes_early := greatest(0, round(extract(epoch from (
          v_shift_end - (p_device_at at time zone 'Asia/Bangkok')::time
        )) / 60))::integer;
        if v_minutes_early > coalesce(v_grace_early, 0) and v_status = 'on_time' then
          v_status := 'early_leave';
          v_early_leave_minutes := v_minutes_early - coalesce(v_grace_early, 0);
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
    status = v_status,
    needs_review = v_attendance.needs_review or v_needs_review,
    review_note = case when v_needs_review then coalesce(v_attendance.review_note || '; ', '') || v_review_note else v_attendance.review_note end
  where id = v_attendance.id
  returning * into v_row;

  return v_row;
end;
$function$;
