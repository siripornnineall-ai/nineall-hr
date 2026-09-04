-- shift_assignments.is_work_from_home existed in the schema since the start but was never
-- read anywhere — setting it (e.g. for an employee who WFHs every weekday) had zero visible
-- effect: clock_in() always computed late/on_time from the shift's office start time
-- regardless of the flag, so nothing in the UI ever showed "Work From Home". Now clock_in()
-- checks the day's shift_assignments row and sets status = 'work_from_home' directly (skipping
-- the late computation entirely, same as the existing half-day-swap exemption) whenever it's
-- flagged, so the WFH badge/status shows up everywhere status already renders (admin's
-- per-employee attendance list, leaderboards, etc.) with no other code changes needed —
-- clock_out() already carries whatever status clock_in() set forward untouched unless it was
-- specifically 'on_time' or 'late', so it needs no change.
create or replace function public.clock_in(p_device_at timestamp with time zone, p_latitude double precision, p_longitude double precision, p_accuracy_m double precision, p_selfie_path text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text, p_work_location_id uuid DEFAULT NULL::uuid, p_is_offline boolean DEFAULT false)
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
  v_is_wfh boolean := false;
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
  v_on_approved_half_day_off boolean := false;
begin
  if v_employee_id is null then
    raise exception 'ไม่พบข้อมูลพนักงานสำหรับบัญชีนี้' using errcode = '42501';
  end if;

  select id into v_existing_id from attendance_records
    where employee_id = v_employee_id and work_date = v_work_date;
  if v_existing_id is not null then
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
