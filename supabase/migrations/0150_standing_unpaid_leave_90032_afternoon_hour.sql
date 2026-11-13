-- Owner's instruction 2026-11-13: Nu (90032) takes UNPAID leave 16:30-17:30 every working day (shift 08:30-17:30).
-- Until now an UNPAID hourly leave row was added by hand each day, so from 2 Nov the days showed "ออกก่อน" (early leave).
-- This adds the approved UNPAID hourly rows for her scheduled workdays (existing rows are never touched) and keeps adding
-- them every night for the next 7 days. Inserting an approved partial leave re-judges that day's attendance automatically
-- (trigger rejudge_attendance_on_partial_leave_approval). The "new leave request" notifications the insert creates are removed
-- because the request is already approved.
-- To stop the daily rule:  select cron.unschedule('standing-unpaid-leave-90032');

create or replace function public.sync_standing_unpaid_leave(p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_emp uuid;
  v_org uuid;
  v_type uuid;
  v_ids uuid[];
begin
  select id, org_id into v_emp, v_org from employees where employee_code = '90032' and deleted_at is null and employment_status in ('active', 'probation');
  select id into v_type from leave_types where code = 'UNPAID';
  if v_emp is null or v_type is null then
    return 0;
  end if;

  with ins as (
    insert into leave_requests (org_id, employee_id, leave_type_id, unit, start_date, end_date, start_time, end_time, status, approval_stage, reason)
    select v_org, v_emp, v_type, 'hourly', a.work_date, a.work_date, time '16:30', time '17:30', 'approved', 'done',
           'ลาไม่รับค่าจ้าง 16:30-17:30 ทุกวัน (ตามคำสั่งเจ้าของ 13 พ.ย. 2569)'
      from shift_assignments a
     where a.employee_id = v_emp and a.work_date between p_from and p_to
       and a.is_day_off = false and a.shift_id is not null
       and not exists (select 1 from company_holidays h where h.org_id = v_org and h.holiday_date = a.work_date)
       and not exists (select 1 from leave_requests l
                        where l.employee_id = v_emp and a.work_date between l.start_date and l.end_date
                          and l.status in ('approved', 'pending')
                          and (l.unit in ('full_day', 'half_day') or l.leave_type_id = v_type
                               or (l.start_time is not null and l.end_time is not null and l.start_time < time '17:30' and l.end_time > time '16:30')))
    returning id)
  select coalesce(array_agg(id), '{}') into v_ids from ins;

  if array_length(v_ids, 1) > 0 then
    delete from notifications n
     where n.created_at >= now() - interval '5 minutes'
       and n.type = 'leave_request_submitted'
       and (n.data ->> 'leave_request_id')::uuid = any (v_ids);
  end if;
  return coalesce(array_length(v_ids, 1), 0);
end;
$function$;

revoke all on function public.sync_standing_unpaid_leave(date, date) from public;

-- the days since 2 Nov that were missing it, plus the coming week
select public.sync_standing_unpaid_leave(date '2026-11-02', date '2026-11-20');

-- every night at 00:30 Bangkok: today and the next 7 days
select cron.schedule(
  'standing-unpaid-leave-90032',
  '30 17 * * *',
  $job$select public.sync_standing_unpaid_leave((now() at time zone 'Asia/Bangkok')::date, (now() at time zone 'Asia/Bangkok')::date + 7)$job$
);
