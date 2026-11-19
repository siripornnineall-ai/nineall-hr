-- Task reviewer (owner 2026-11-19): ธนภรณ์ (คะนิ้ง, 90031) checks the work of EVERYONE in every department.
--   * employees.task_reviewer marks the people who may approve / send back any card on any board;
--   * department heads keep approving their members' cards, but nobody can approve their own card, so a head's own work
--     (e.g. กาหลง's) can only be approved by the reviewer;
--   * the reviewer is notified when a card is sent for review; she can read and update cards in every department
--     (the guard trigger still limits what she can change: approve / stars / note / send back).

alter table public.employees add column if not exists task_reviewer boolean not null default false;
update public.employees set task_reviewer = true where id = 'c3e7535d-7f20-4202-aba3-2e61bc8ecba2';

create or replace function public.is_task_reviewer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select e.task_reviewer from employees e where e.id = current_employee_id()), false);
$$;
grant execute on function public.is_task_reviewer() to authenticated;

drop policy if exists task_cards_update on public.task_cards;
create policy task_cards_update on public.task_cards for update
  using (org_id = (select current_org_id())
         and ((select is_admin_or_hr()) or department_id = (select my_department_id())
              or is_department_head(department_id) or (select is_task_reviewer())))
  with check (org_id = (select current_org_id()));

create or replace function public.guard_task_card()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := current_employee_id();
  v_head boolean;
  v_reviewer boolean;
  v_admin boolean := coalesce(is_admin_or_hr(), false);
  v_owner boolean;
  v_submitted_day date;
begin
  if auth.uid() is null then
    return new;
  end if;

  v_head := is_department_head(new.department_id);
  v_reviewer := is_task_reviewer();

  if not exists (select 1 from employees e join departments d on d.id = new.department_id
                 where e.id = new.assignee_employee_id and e.org_id = new.org_id
                   and (e.department_id = new.department_id or e.id = d.head_employee_id)) then
    raise exception 'ผู้รับผิดชอบต้องอยู่ในแผนกนี้';
  end if;

  if tg_op = 'INSERT' then
    new.created_by_employee_id := v_me;
    new.submitted_at := null; new.approved_at := null; new.approved_by_employee_id := null;
    new.quality := null; new.is_late := null; new.review_note := null;
    if new.status not in ('todo', 'doing') then
      raise exception 'การ์ดใหม่ต้องอยู่ในช่อง "ต้องทำ" หรือ "กำลังทำ"';
    end if;
    if not (v_head or v_admin) then
      new.weight := 1;
      if new.assignee_employee_id is distinct from v_me then
        raise exception 'ลูกทีมเพิ่มการ์ดได้เฉพาะงานของตัวเอง หัวหน้าแผนกเป็นผู้มอบหมายงานให้คนอื่น';
      end if;
    end if;
    return new;
  end if;

  v_owner := v_me is not null and (old.assignee_employee_id = v_me or old.created_by_employee_id = v_me);

  if new.org_id is distinct from old.org_id or new.created_by_employee_id is distinct from old.created_by_employee_id
     or new.created_at is distinct from old.created_at then
    raise exception 'แก้ไขข้อมูลนี้ไม่ได้';
  end if;
  if new.department_id is distinct from old.department_id and not v_admin then
    raise exception 'ย้ายการ์ดไปแผนกอื่นได้เฉพาะ HR';
  end if;
  if (new.weight is distinct from old.weight or new.due_date is distinct from old.due_date
      or new.assignee_employee_id is distinct from old.assignee_employee_id) and not (v_head or v_admin) then
    raise exception 'น้ำหนักงาน กำหนดส่ง และผู้รับผิดชอบ แก้ได้เฉพาะหัวหน้าแผนก';
  end if;
  if (new.title is distinct from old.title or new.description is distinct from old.description)
     and not (v_head or v_admin or (v_owner and old.status in ('todo', 'doing'))) then
    raise exception 'แก้ไขรายละเอียดการ์ดนี้ไม่ได้';
  end if;
  if (new.quality is distinct from old.quality or new.review_note is distinct from old.review_note) and not (v_head or v_reviewer) then
    raise exception 'ให้คะแนนและความเห็นได้เฉพาะหัวหน้าแผนกหรือผู้ตรวจงาน';
  end if;
  if (new.approved_at is distinct from old.approved_at or new.approved_by_employee_id is distinct from old.approved_by_employee_id
      or new.is_late is distinct from old.is_late or new.submitted_at is distinct from old.submitted_at)
     and new.status is not distinct from old.status then
    raise exception 'แก้ไขข้อมูลการอนุมัติไม่ได้';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'done' then
      if not (v_head or v_reviewer) then
        raise exception 'เฉพาะหัวหน้าแผนกหรือผู้ตรวจงานเท่านั้นที่อนุมัติงานให้เสร็จได้';
      end if;
      if old.assignee_employee_id = v_me then
        raise exception 'อนุมัติงานของตัวเองไม่ได้';
      end if;
      if new.quality is null then
        raise exception 'กรุณาให้คะแนนคุณภาพงาน 1-5 ก่อนอนุมัติ';
      end if;
      new.approved_at := now();
      new.approved_by_employee_id := v_me;
      new.submitted_at := coalesce(old.submitted_at, now());
      v_submitted_day := (new.submitted_at at time zone 'Asia/Bangkok')::date;
      new.is_late := new.due_date is not null and v_submitted_day > new.due_date;
    elsif old.status = 'done' then
      if not (v_head or v_reviewer) then
        raise exception 'เฉพาะหัวหน้าแผนกหรือผู้ตรวจงานเท่านั้นที่เปิดงานที่เสร็จแล้วกลับมาได้';
      end if;
      new.approved_at := null; new.approved_by_employee_id := null; new.is_late := null; new.quality := null;
      new.submitted_at := null;
    elsif new.status = 'cancelled' or old.status = 'cancelled' then
      if not (v_head or v_admin) then
        raise exception 'ยกเลิกงานได้เฉพาะหัวหน้าแผนก';
      end if;
    elsif new.status = 'review' then
      if not (v_owner or v_head) then
        raise exception 'ส่งตรวจได้เฉพาะผู้รับผิดชอบงาน';
      end if;
      new.submitted_at := now();
    elsif old.status = 'review' then
      if not (v_owner or v_head or v_reviewer) then
        raise exception 'ย้ายการ์ดนี้ไม่ได้';
      end if;
      new.submitted_at := null;
    else
      if not (v_owner or v_head or v_admin) then
        raise exception 'ย้ายได้เฉพาะการ์ดของตัวเอง';
      end if;
    end if;
  end if;

  return new;
end;
$function$;

-- Notify: head (when not the assignee) AND every reviewer (when not the assignee) get "มีงานรอคุณตรวจ".
create or replace function public.notify_task_card()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_head uuid;
  v_profile uuid;
  v_title text;
  v_body text;
  v_type text;
  r record;
begin
  if new.is_group then
    return new;
  end if;
  select head_employee_id into v_head from departments where id = new.department_id;

  if tg_op = 'INSERT' then
    if new.assignee_employee_id is distinct from new.created_by_employee_id then
      select id into v_profile from profiles where employee_id = new.assignee_employee_id and is_active limit 1;
      v_type := 'task_assigned'; v_title := 'มีงานใหม่มอบหมายให้คุณ';
      v_body := new.title || coalesce(' · กำหนดส่ง ' || to_char(new.due_date, 'DD/MM/YYYY'), '');
    end if;
  elsif new.status is distinct from old.status then
    if new.status = 'review' then
      v_title := 'มีงานรอคุณตรวจ';
      v_body := new.title || ' · ' || coalesce((select coalesce(nullif(nickname, ''), first_name) from employees where id = new.assignee_employee_id), '');
      for r in
        select distinct p.id as profile_id
          from profiles p
         where p.is_active and p.employee_id is distinct from new.assignee_employee_id
           and (p.employee_id = v_head
                or p.employee_id in (select e.id from employees e where e.task_reviewer and e.deleted_at is null))
      loop
        insert into notifications (org_id, profile_id, type, title, body, data, channel)
        values (new.org_id, r.profile_id, 'task_review_requested', v_title, v_body, jsonb_build_object('task_card_id', new.id), 'in_app');
      end loop;
    elsif new.status = 'done' then
      select id into v_profile from profiles where employee_id = new.assignee_employee_id and is_active limit 1;
      v_type := 'task_approved'; v_title := 'งานผ่านการอนุมัติแล้ว';
      v_body := new.title || ' · คุณภาพ ' || new.quality || '/5' || case when new.is_late then ' · ส่งเกินกำหนด' else '' end;
    elsif old.status = 'review' and new.status = 'doing' then
      select id into v_profile from profiles where employee_id = new.assignee_employee_id and is_active limit 1;
      v_type := 'task_returned'; v_title := 'งานถูกส่งกลับให้แก้ไข';
      v_body := new.title || coalesce(' · ' || nullif(new.review_note, ''), '');
    end if;
  end if;

  if v_profile is not null then
    insert into notifications (org_id, profile_id, type, title, body, data, channel)
    values (new.org_id, v_profile, v_type, v_title, v_body, jsonb_build_object('task_card_id', new.id), 'in_app');
  end if;
  return new;
end;
$$;
