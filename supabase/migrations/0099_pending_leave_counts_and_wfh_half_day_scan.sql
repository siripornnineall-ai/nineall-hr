-- Two owner requests from 2026-09-28.
--
-- 1. "They filed leave but it still says late." Until the หัวหน้า and HR approve, a
--    request is 'pending' and the day was judged as if there were no leave. The effective
--    window now also honours PENDING partial-day leave, and the day is re-judged whenever a
--    request is filed, approved, rejected or cancelled — so a rejection puts the late mark
--    back, and a request filed after the scan clears it.
--
-- 2. Half-day WFH then the other half at the office: approving the WFH half pre-filled the
--    day with the WFH times and status 'work_from_home', so the office scan was refused as
--    "already clocked in" (employee 90036, 2026-09-25 — she filed the same request twice
--    trying to get in). clock_in() now treats such a row as a placeholder: the office scan
--    becomes the day's clock-in and the WFH half is reflected through the effective window
--    (morning WFH -> the day starts at 13:00, so a 13:xx scan is on time).

create or replace function public.effective_shift_window(p_employee_id uuid, p_work_date date, p_shift_start time, p_shift_end time)
returns table (eff_start time, eff_end time)
language plpgsql stable security definer set search_path = public as $$
declare
  v_start time := p_shift_start;
  v_end time := p_shift_end;
  v_morning_off boolean := false;
  v_afternoon_off boolean := false;
  v_hourly_start time;
  v_hourly_end time;
begin
  if p_shift_start is null or p_shift_end is null then
    eff_start := v_start; eff_end := v_end; return next; return;
  end if;

  select
    bool_or(coalesce(l.end_time, time '12:00') <= time '13:00' and coalesce(l.start_time, time '08:00') < time '12:00'),
    bool_or(coalesce(l.start_time, time '13:00') >= time '12:00')
    into v_morning_off, v_afternoon_off
    from leave_requests l
    where l.employee_id = p_employee_id and l.status in ('pending', 'approved')
      and p_work_date between l.start_date and l.end_date
      and (l.unit = 'half_day' or (l.unit = 'full_day' and l.total_days < 1));

  if coalesce(v_morning_off, false) then v_start := greatest(v_start, time '13:00'); end if;
  if coalesce(v_afternoon_off, false) then v_end := least(v_end, time '12:00'); end if;

  select min(l.start_time), max(l.end_time) into v_hourly_start, v_hourly_end
    from leave_requests l
    where l.employee_id = p_employee_id and l.status in ('pending', 'approved')
      and p_work_date between l.start_date and l.end_date
      and l.unit = 'hourly' and l.start_time is not null and l.end_time is not null;

  if v_hourly_start is not null then
    if v_hourly_start <= p_shift_start + interval '30 minutes' and v_hourly_end > v_start then
      v_start := greatest(v_start, case when v_hourly_end >= time '12:00' and v_hourly_end <= time '13:00' then time '13:00' else v_hourly_end end);
    end if;
    if v_hourly_end >= p_shift_end - interval '30 minutes' and v_hourly_start < v_end then
      v_end := least(v_end, case when v_hourly_start >= time '12:00' and v_hourly_start <= time '13:00' then time '12:00' else v_hourly_start end);
    end if;
  end if;

  eff_start := v_start;
  eff_end := v_end;
  return next;
end;
$$;

-- Re-judge on every status change and on filing (not only on approval).
create or replace function public.rejudge_attendance_on_partial_leave_approval()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_row leave_requests;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  if v_row.unit = 'full_day' and v_row.total_days >= 1 then
    return v_row;
  end if;
  if tg_op = 'UPDATE' and old.status = new.status and old.start_time is not distinct from new.start_time and old.end_time is not distinct from new.end_time
     and old.start_date = new.start_date and old.end_date = new.end_date and old.unit = new.unit then
    return new;
  end if;
  for r in
    select id from attendance_records
      where employee_id = v_row.employee_id and work_date between v_row.start_date and v_row.end_date
        and clock_in_server_at is not null and status in ('on_time', 'late', 'early_leave')
  loop
    perform rejudge_attendance_day(r.id);
  end loop;
  return v_row;
end;
$$;

drop trigger if exists trg_rejudge_attendance_partial_leave on leave_requests;
create trigger trg_rejudge_attendance_partial_leave
  after insert or update of status, start_time, end_time, start_date, end_date, unit or delete on leave_requests
  for each row execute function rejudge_attendance_on_partial_leave_approval();

-- clock_in(): a WFH/off-site row written by a partial-day WFH/off-site approval is a
-- placeholder for the office half — take the scan.
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
  v_existing attendance_records%rowtype;
  v_partial_remote boolean := false;
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

  select * into v_existing from attendance_records
    where employee_id = v_employee_id and work_date = v_work_date;
  if v_existing.clock_in_server_at is not null then
    -- A WFH / off-site half-day filled in by leave approval is not a real scan.
    select exists (
      select 1 from leave_requests l join leave_types t on t.id = l.leave_type_id
        where l.employee_id = v_employee_id and l.status in ('pending', 'approved')
          and v_work_date between l.start_date and l.end_date
          and t.code in ('WFH', 'OFFSITE') and (l.unit <> 'full_day' or l.total_days < 1)
    ) into v_partial_remote;
    if not (v_partial_remote and v_existing.status in ('work_from_home', 'off_site') and v_existing.clock_in_latitude is null) then
      raise exception 'คุณลงเวลาเข้างานของวันนี้ไปแล้ว' using errcode = '23505';
    end if;
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
