-- Notify the employee themselves once their leave request is decided (approved/rejected).
create or replace function public.notify_leave_request_decided()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_profile_id uuid;
  v_leave_type_name text;
  v_title text;
  v_body text;
begin
  if old.status is distinct from 'pending' or new.status not in ('approved', 'rejected') then
    return new;
  end if;

  select id into v_profile_id from profiles where employee_id = new.employee_id limit 1;
  if v_profile_id is null then
    return new;
  end if;

  select name_th into v_leave_type_name from leave_types where id = new.leave_type_id;

  v_title := case when new.status = 'approved' then 'คำขอลาได้รับการอนุมัติ' else 'คำขอลาถูกปฏิเสธ' end;
  v_body := coalesce(v_leave_type_name, 'คำขอลา') || ' ' || new.total_days || ' วัน (' ||
    to_char(new.start_date, 'DD Mon') || (case when new.end_date <> new.start_date then ' - ' || to_char(new.end_date, 'DD Mon') else '' end) || ')';

  insert into notifications (org_id, profile_id, type, title, body, data, channel)
  values (new.org_id, v_profile_id, 'leave_request_decided', v_title, v_body,
    jsonb_build_object('leave_request_id', new.id), 'in_app');

  return new;
end;
$function$;

drop trigger if exists trg_notify_leave_request_decided on leave_requests;
create trigger trg_notify_leave_request_decided
  after update of status on leave_requests
  for each row execute function notify_leave_request_decided();

-- Notify a note's author when someone comments on it (not when they comment on their own).
create or replace function public.notify_note_comment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_note_author_employee_id uuid;
  v_author_profile_id uuid;
  v_commenter_name text;
begin
  select employee_id into v_note_author_employee_id from employee_notes where id = new.note_id;
  if v_note_author_employee_id is null or v_note_author_employee_id = new.employee_id then
    return new;
  end if;

  select id into v_author_profile_id from profiles where employee_id = v_note_author_employee_id limit 1;
  if v_author_profile_id is null then
    return new;
  end if;

  select coalesce(nickname, first_name) into v_commenter_name from employees where id = new.employee_id;

  insert into notifications (org_id, profile_id, type, title, body, data, channel)
  values (new.org_id, v_author_profile_id, 'note_comment', 'มีคนแสดงความคิดเห็นในโน้ตของคุณ',
    coalesce(v_commenter_name, 'เพื่อนร่วมงาน') || ': ' || left(new.text, 100),
    jsonb_build_object('note_id', new.note_id, 'comment_id', new.id), 'in_app');

  return new;
end;
$function$;

drop trigger if exists trg_notify_note_comment on note_comments;
create trigger trg_notify_note_comment
  after insert on note_comments
  for each row execute function notify_note_comment();
