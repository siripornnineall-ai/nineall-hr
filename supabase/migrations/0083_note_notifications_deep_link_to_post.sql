-- Point note_comment/note_reaction pushes at the note owner's own post-detail page
-- (/colleagues/:employeeId in self-view mode shows the note + full comment thread + reply box)
-- instead of the generic home screen, so tapping the OS notification jumps straight to the post.
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
    jsonb_build_object('note_id', new.note_id, 'comment_id', new.id, 'url', '/colleagues/' || v_note_author_employee_id), 'in_app');

  return new;
end;
$function$;

create or replace function public.notify_note_reaction()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_note_author_employee_id uuid;
  v_author_profile_id uuid;
  v_reactor_name text;
begin
  if tg_op = 'UPDATE' and old.emoji is not distinct from new.emoji then
    return new;
  end if;

  select employee_id into v_note_author_employee_id from employee_notes where id = new.note_id;
  if v_note_author_employee_id is null or v_note_author_employee_id = new.employee_id then
    return new;
  end if;

  select id into v_author_profile_id from profiles where employee_id = v_note_author_employee_id limit 1;
  if v_author_profile_id is null then
    return new;
  end if;

  select coalesce(nickname, first_name) into v_reactor_name from employees where id = new.employee_id;

  insert into notifications (org_id, profile_id, type, title, body, data, channel)
  values (new.org_id, v_author_profile_id, 'note_reaction',
    coalesce(v_reactor_name, 'เพื่อนร่วมงาน') || ' กดรีแอคชั่น ' || new.emoji || ' ในโน้ตของคุณ', null,
    jsonb_build_object('note_id', new.note_id, 'reaction_id', new.id, 'emoji', new.emoji, 'url', '/colleagues/' || v_note_author_employee_id), 'in_app');

  return new;
end;
$function$;
