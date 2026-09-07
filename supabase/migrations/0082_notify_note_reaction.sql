-- Notify a note's author when someone reacts to it (emoji like/laugh/etc via note_reactions) —
-- same pattern as notify_note_comment(). Reacting is an upsert from the UI (insert on first
-- reaction, update if they change their emoji), so this fires on both; skips self-reactions and
-- skips no-op updates where the emoji didn't actually change.
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
    jsonb_build_object('note_id', new.note_id, 'reaction_id', new.id, 'emoji', new.emoji, 'url', '/'), 'in_app');

  return new;
end;
$function$;

drop trigger if exists trg_notify_note_reaction on note_reactions;
create trigger trg_notify_note_reaction
  after insert or update on note_reactions
  for each row execute function notify_note_reaction();

-- Also give note_comment's data a 'url' (see migration note_notifications_include_url applied
-- alongside this one) so tapping either kind of note push lands on the home screen.
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
    jsonb_build_object('note_id', new.note_id, 'comment_id', new.id, 'url', '/'), 'in_app');

  return new;
end;
$function$;
