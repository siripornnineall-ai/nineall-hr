-- Half-day leave was blocking the other half of the day.
--
-- Two real cases on 2026-09-22 (employee 90032):
--   * Approving a half-day leave for a past date overwrote the real clock-in/out of the
--     half she DID work (decide_leave_request's full-day branch ran because the request
--     had been saved as unit 'full_day' with total_days 0.5).
--   * Approving a half-day leave for a future date pre-creates a 'leave' attendance row;
--     clock_in() then refused her scan that afternoon with "already clocked in today"
--     because it only checked that a row existed.
--
-- Changes here:
--   * clock_in(): an existing row with no clock-in yet (leave/holiday/day-off/absent
--     placeholder) is filled in, not rejected — insert becomes an upsert. Approved leave
--     covering the morning (unit <> 'full_day' and ending by 13:00) skips the late check,
--     like an approved morning half-day swap already does.
--   * clock_out(): approved leave covering the afternoon (starting at/after 12:00) skips
--     the early-leave check, like an afternoon half-day swap already does.
--   * finalize_leave_request_internal(): treat a request with total_days < 1 as half-day
--     even if its unit says 'full_day', so approving it never wipes the worked half.

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

  -- Only a row that already holds a clock-in counts as "already clocked in"; a placeholder
  -- written by leave approval / holiday sync / absent sync gets filled in below.
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
    union all
    -- approved leave for (part of) the morning: half-day / hourly leave ending by 13:00
    select 1 from leave_requests
      where employee_id = v_employee_id and status = 'approved'
        and v_work_date between start_date and end_date
        and (unit <> 'full_day' or total_days < 1)
        and coalesce(end_time, time '12:00') <= time '13:00'
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
    union all
    -- approved leave for (part of) the afternoon: half-day / hourly leave starting at/after 12:00
    select 1 from leave_requests
      where employee_id = v_employee_id and status = 'approved'
        and v_work_date between start_date and end_date
        and (unit <> 'full_day' or total_days < 1)
        and coalesce(start_time, time '13:00') >= time '12:00'
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

-- Leave approval: a request saved as 'full_day' but for half a day (total_days < 1) must
-- not take the full-day path that wipes a real clock-in. Patch the one condition in place
-- rather than restating the whole function.
do $$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'finalize_leave_request_internal';
  if v_src is null then
    raise exception 'finalize_leave_request_internal not found';
  end if;
  if position('v_total_days numeric' in v_src) > 0 then
    return; -- already patched
  end if;
  v_new := v_src;
  v_new := replace(v_new, 'declare' || E'\n' || '  v_org_id uuid := current_org_id();',
                          'declare' || E'\n' || '  v_org_id uuid := current_org_id();' || E'\n' || '  v_total_days numeric;');
  v_new := replace(v_new, 'select employee_id, leave_type_id, start_date, end_date, unit::text, start_time, end_time' || E'\n' ||
                          '  into v_employee_id, v_leave_type_id, v_start_date, v_end_date, v_unit, v_start_time, v_end_time',
                          'select employee_id, leave_type_id, start_date, end_date, unit::text, start_time, end_time, total_days' || E'\n' ||
                          '  into v_employee_id, v_leave_type_id, v_start_date, v_end_date, v_unit, v_start_time, v_end_time, v_total_days');
  v_new := replace(v_new, 'if v_employee_id is null then' || E'\n' || '    raise exception ''NOT_FOUND'';' || E'\n' || '  end if;',
                          'if v_employee_id is null then' || E'\n' || '    raise exception ''NOT_FOUND'';' || E'\n' || '  end if;' || E'\n' ||
                          '  if v_unit = ''full_day'' and v_total_days < 1 then' || E'\n' || '    v_unit := ''half_day'';' || E'\n' || '  end if;');
  if v_new = v_src then
    raise exception 'finalize_leave_request_internal: expected text not found, not patched';
  end if;
  execute v_new;
end $$;
