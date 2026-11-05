-- The notification an employee gets when a leave request is approved or rejected now also says how many days of
-- that leave type are left (owner 2026-11-05: tell people what they can still take so nobody goes over).
-- Only for sick, personal and vacation leave, the types shown as "days left". The balance is already updated
-- when this trigger runs (trg_leave_requests_decision fires first, alphabetical order).

create or replace function public.notify_leave_request_decided()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_profile_id uuid;
  v_leave_type_name text;
  v_leave_code text;
  v_title text;
  v_body text;
  v_remaining numeric;
begin
  if old.status is distinct from 'pending' or new.status not in ('approved', 'rejected') then
    return new;
  end if;

  select id into v_profile_id from profiles where employee_id = new.employee_id limit 1;
  if v_profile_id is null then
    return new;
  end if;

  select name_th, code into v_leave_type_name, v_leave_code from leave_types where id = new.leave_type_id;

  v_title := case when new.status = 'approved' then 'คำขอลาได้รับการอนุมัติ' else 'คำขอลาถูกปฏิเสธ' end;
  v_body := coalesce(v_leave_type_name, 'คำขอลา') || ' ' || new.total_days || ' วัน (' ||
    to_char(new.start_date, 'DD Mon') || (case when new.end_date <> new.start_date then ' - ' || to_char(new.end_date, 'DD Mon') else '' end) || ')';

  if v_leave_code in ('SICK', 'PERSONAL', 'VACATION') then
    select round(entitled_days + carried_over_days - used_days - pending_days, 2) into v_remaining
      from leave_balances
     where employee_id = new.employee_id and leave_type_id = new.leave_type_id and year = extract(year from new.start_date)::int;
    if v_remaining is not null then
      v_body := v_body || ' · ' || coalesce(v_leave_type_name, 'วันลา') || 'เหลือ ' || v_remaining || ' วัน';
    end if;
  end if;

  insert into notifications (org_id, profile_id, type, title, body, data, channel)
  values (new.org_id, v_profile_id, 'leave_request_decided', v_title, v_body,
    jsonb_build_object('leave_request_id', new.id), 'in_app');

  return new;
end;
$function$;
