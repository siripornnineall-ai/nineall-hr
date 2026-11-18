-- Clock-in / clock-out reminders (owner 2026-11-18): staff keep forgetting to clock.
--   shift start + 5 min (08:30 shift -> 08:35, 09:00 shift -> 09:05) -> "อย่าลืมกดเข้างาน" to people scheduled to work
--     today who have not clocked in yet (per person, by their own shift)
--   18:05 -> "อย่าลืมกดออกงาน" to EVERYONE who works today (scheduled shift or already clocked in)
--   20:05 -> same reminder, only to people who clocked in but still have not clocked out
-- Each reminder is a row in `notifications`; the existing trigger (0081) turns every notifications row into a web push on the
-- person's phone, so this reuses the push pipeline. A cron job calls this every minute and the function only acts inside
-- the 5-minute window after each reminder time; it never sends the same reminder twice a day to the same person.
--
-- Clock-in reminders skip (and only go out inside the 5-minute window after the person's own shift start): day off / WFH / off-site / not scheduled, company holidays (unless swapped to work them),
-- full-day leave (approved or pending), morning half-day leave and a morning half-day swap, attendance_exempt staff.

create or replace function public.send_clock_reminders(p_kind text default null, p_dry_run boolean default false)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_now timestamp := now() at time zone 'Asia/Bangkok';
  v_date date := (now() at time zone 'Asia/Bangkok')::date;
  v_hhmm text := to_char(now() at time zone 'Asia/Bangkok', 'HH24:MI');
  v_time time := (now() at time zone 'Asia/Bangkok')::time;
  v_auto boolean := p_kind is null;
  v_kind text := p_kind;
  v_n integer := 0;
  v_title text;
  v_body text;
begin
  if auth.uid() is not null then
    return 0; -- cron / service role only
  end if;
  if v_kind is null then
    v_kind := case
      when v_hhmm >= '18:05' and v_hhmm < '18:10' then 'out_1805'
      when v_hhmm >= '20:05' and v_hhmm < '20:10' then 'out_2005'
      else 'in'
    end;
  end if;

  if v_kind = 'in' then
    v_title := 'อย่าลืมกดเข้างาน';
    v_body := 'เลยเวลาเข้างานมาแล้ว ยังไม่ได้กดเข้างานวันนี้ กดเข้างานในแอปได้เลย';
  else
    v_title := 'อย่าลืมกดออกงาน';
    v_body := 'ยังไม่ได้กดออกงานวันนี้ ถ้าเลิกงานแล้วอย่าลืมกดออกงานในแอป';
  end if;

  with targets as (
    select e.org_id, p.id as profile_id
      from employees e
      join profiles p on p.employee_id = e.id and p.is_active
     where e.deleted_at is null and e.employment_status in ('active', 'probation')
       and not coalesce(e.attendance_exempt, false)
       and e.hire_date <= v_date
       and (
         (v_kind = 'in'
           and exists (select 1 from shift_assignments a
                        join work_shifts ws on ws.id = a.shift_id
                        where a.employee_id = e.id and a.work_date = v_date
                          and a.is_day_off = false
                          and coalesce(a.is_work_from_home, false) = false and coalesce(a.is_off_site, false) = false
                          and (not v_auto or (v_time >= ws.start_time + interval '5 minutes' and v_time < ws.start_time + interval '10 minutes')))
           and not exists (select 1 from attendance_records r where r.employee_id = e.id and r.work_date = v_date and r.clock_in_server_at is not null)
           and not exists (select 1 from leave_requests l
                            where l.employee_id = e.id and v_date between l.start_date and l.end_date and l.status in ('approved', 'pending')
                              and (l.unit = 'full_day' or (l.unit = 'half_day' and coalesce(l.start_time, time '00:00') < time '12:00')))
           and not exists (select 1 from day_off_swap_requests s
                            where s.employee_id = e.id and s.substitute_date = v_date and s.status = 'approved'
                              and (s.unit = 'full_day' or s.period = 'morning'))
           and not exists (select 1 from company_holidays h
                            where h.org_id = e.org_id and h.holiday_date = v_date
                              and not exists (select 1 from holiday_swap_requests hs
                                               where hs.employee_id = e.id and hs.holiday_date = v_date and hs.status = 'approved'))
         )
         or
         -- 18:05: everyone who works today (scheduled shift, or already clocked in), even if they have clocked out already
         (v_kind = 'out_1805'
           and (exists (select 1 from shift_assignments a
                         where a.employee_id = e.id and a.work_date = v_date and a.is_day_off = false and a.shift_id is not null)
                or exists (select 1 from attendance_records r
                            where r.employee_id = e.id and r.work_date = v_date and r.clock_in_server_at is not null)))
         or
         -- 20:05: only people who clocked in but still have not clocked out
         (v_kind = 'out_2005'
           and exists (select 1 from attendance_records r
                        where r.employee_id = e.id and r.work_date = v_date
                          and r.clock_in_server_at is not null and r.clock_out_server_at is null))
       )
       and not exists (select 1 from notifications n
                        where n.profile_id = p.id and n.type = 'clock_reminder'
                          and n.data->>'kind' = v_kind and n.data->>'date' = v_date::text)
  ), ins as (
    insert into notifications (org_id, profile_id, type, title, body, data, channel)
    select org_id, profile_id, 'clock_reminder', v_title, v_body,
           jsonb_build_object('url', '/attendance', 'kind', v_kind, 'date', v_date::text), 'push'
      from targets
     where not p_dry_run
    returning 1
  )
  select case when p_dry_run then (select count(*) from targets) else (select count(*) from ins) end into v_n;

  return v_n;
end;
$function$;

revoke all on function public.send_clock_reminders(text, boolean) from public;

select cron.schedule('clock-reminders-every-minute', '* * * * *', $job$select public.send_clock_reminders()$job$);
