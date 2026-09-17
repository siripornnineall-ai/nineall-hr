-- Hard geofence: outside the work area, clock-in/clock-out is refused.
--
-- Until now clock_in()/clock_out() only flagged an out-of-area punch for review
-- (needs_review) and still saved it — in the last 30 days that let through punches from
-- 1-7 km away (clocking out after leaving, clocking in before arriving). The owner wants
-- those blocked outright (2026-09-17).
--
-- Done as BEFORE triggers on attendance_records rather than by editing clock_in()/
-- clock_out(), so those two large functions stay untouched. The triggers only act on the
-- employee's own punch — identified by the app.clock_action flag those functions set, plus
-- GPS coordinates being written — so HR edits, backdated entries, leave auto-fill and the
-- WFH cron are unaffected.
--
-- Rules:
--   * allowed if within radius of ANY active work location of the org (8 employees have
--     schedules with no work location at all, which previously meant "never checked")
--   * GPS tolerance: the reported accuracy, capped at 50 m, is added to the radius, so an
--     indoor fix that drifts slightly is not rejected
--   * exempt: a WFH day (shift_assignments.is_work_from_home / status work_from_home /
--     off_site), or an approved WFH / OFFSITE leave request covering the date
--   * when the schedule had no location, the nearest one is recorded on the punch so the
--     distance/within columns are filled in
--   * switchable without a deploy: a policy_settings row of setting_type 'geofence', e.g.
--     {"enforce": false} or {"enforce": true, "accuracy_tolerance_m": 80}

create or replace function public.enforce_clock_geofence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_lat double precision;
  v_lng double precision;
  v_acc double precision;
  v_policy jsonb;
  v_enforce boolean := true;
  v_tolerance_cap integer := 50;
  v_tolerance double precision;
  v_loc record;
  v_exempt boolean := false;
begin
  -- Only the employee's own punch through clock_in()/clock_out().
  if coalesce(current_setting('app.clock_action', true), '') <> 'true' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.clock_in_latitude is null or new.clock_in_longitude is null then
      return new;
    end if;
    v_kind := 'in';
    v_lat := new.clock_in_latitude; v_lng := new.clock_in_longitude; v_acc := new.clock_in_accuracy_m;
  else
    if new.clock_out_latitude is null or new.clock_out_longitude is null or old.clock_out_latitude is not null then
      return new;
    end if;
    v_kind := 'out';
    v_lat := new.clock_out_latitude; v_lng := new.clock_out_longitude; v_acc := new.clock_out_accuracy_m;
  end if;

  select value into v_policy
    from policy_settings
    where org_id = new.org_id and setting_type = 'geofence' and effective_date <= current_date
    order by effective_date desc
    limit 1;
  if v_policy is not null then
    v_enforce := coalesce((v_policy->>'enforce')::boolean, v_enforce);
    v_tolerance_cap := coalesce((v_policy->>'accuracy_tolerance_m')::integer, v_tolerance_cap);
  end if;

  -- Nearest active work location, measured from its edge rather than its centre so a big
  -- radius far away doesn't lose to a small one nearby.
  select w.id, w.name, w.radius_meters,
         geo_distance_meters(v_lat, v_lng, w.latitude, w.longitude) as distance_m
    into v_loc
    from work_locations w
    where w.org_id = new.org_id and w.status = 'active' and w.deleted_at is null
      and w.latitude is not null and w.longitude is not null
    order by geo_distance_meters(v_lat, v_lng, w.latitude, w.longitude) - w.radius_meters
    limit 1;

  if v_loc.id is null then
    return new; -- no location configured: nothing to enforce against
  end if;

  v_tolerance := least(coalesce(v_acc, 0), v_tolerance_cap);

  -- Fill in the columns clock_in()/clock_out() leave null when the schedule has no location.
  if v_kind = 'in' then
    if new.work_location_id is null then
      new.work_location_id := v_loc.id;
    end if;
    if new.clock_in_distance_m is null then
      new.clock_in_distance_m := v_loc.distance_m;
      new.clock_in_within_geofence := v_loc.distance_m <= v_loc.radius_meters;
    end if;
  else
    if new.clock_out_distance_m is null then
      new.clock_out_distance_m := v_loc.distance_m;
      new.clock_out_within_geofence := v_loc.distance_m <= v_loc.radius_meters;
    end if;
  end if;

  if not v_enforce or v_loc.distance_m <= v_loc.radius_meters + v_tolerance then
    return new;
  end if;

  v_exempt := new.status in ('work_from_home', 'off_site')
    or exists (
      select 1 from shift_assignments s
        where s.employee_id = new.employee_id and s.work_date = new.work_date
          and coalesce(s.is_work_from_home, false)
    )
    or exists (
      select 1 from leave_requests l
        join leave_types t on t.id = l.leave_type_id
        where l.employee_id = new.employee_id and l.status = 'approved'
          and t.code in ('WFH', 'OFFSITE')
          and new.work_date between l.start_date and l.end_date
    );
  if v_exempt then
    return new;
  end if;

  raise exception '%',
    'คุณอยู่นอกพื้นที่ทำงานที่กำหนด ไม่สามารถลงเวลา' || (case when v_kind = 'in' then 'เข้างาน' else 'ออกงาน' end) || 'ได้ '
    || '(ห่างจาก ' || v_loc.name || ' ประมาณ ' || round(v_loc.distance_m) || ' เมตร อนุญาตไม่เกิน ' || v_loc.radius_meters || ' เมตร) '
    || 'หากอยู่ในพื้นที่แล้ว ให้เปิด GPS แบบความแม่นยำสูงแล้วลองใหม่ หากทำงานนอกสถานที่หรือ WFH ต้องขอและได้รับอนุมัติก่อน หรือติดต่อ HR'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_enforce_clock_in_geofence on attendance_records;
create trigger trg_enforce_clock_in_geofence
  before insert on attendance_records
  for each row
  execute function enforce_clock_geofence();

drop trigger if exists trg_enforce_clock_out_geofence on attendance_records;
create trigger trg_enforce_clock_out_geofence
  before update of clock_out_latitude on attendance_records
  for each row
  execute function enforce_clock_geofence();
