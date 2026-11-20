-- People who work in more than one department (owner 2026-11-20: คะนิ้งและสมายด์ อยู่ทั้งฝ่ายบุคคลและบัญชี) can have a task board
-- in each of them. employees.department_id stays their main department; employee_departments lists the EXTRA ones.
-- HR / admin maintain the list. Everything that used "my department" for the task board now uses all of a person's departments.

create table if not exists public.employee_departments (
  employee_id uuid not null references public.employees(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (employee_id, department_id)
);
alter table public.employee_departments enable row level security;
create policy employee_departments_select on public.employee_departments for select
  using (org_id = (select current_org_id()));
create policy employee_departments_write on public.employee_departments for all
  using (org_id = (select current_org_id()) and (select is_admin_or_hr()))
  with check (org_id = (select current_org_id()) and (select is_admin_or_hr()));

create or replace function public.my_task_department_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select e.department_id from employees e where e.id = current_employee_id() and e.department_id is not null
  union
  select x.department_id from employee_departments x where x.employee_id = current_employee_id();
$$;
grant execute on function public.my_task_department_ids() to authenticated;

drop policy if exists task_cards_insert on public.task_cards;
create policy task_cards_insert on public.task_cards for insert
  with check (org_id = (select current_org_id())
              and ((select is_admin_or_hr()) or department_id in (select my_task_department_ids()) or is_department_head(department_id)));

drop policy if exists task_cards_update on public.task_cards;
create policy task_cards_update on public.task_cards for update
  using (org_id = (select current_org_id())
         and ((select is_admin_or_hr()) or department_id in (select my_task_department_ids())
              or is_department_head(department_id) or (select is_task_reviewer())))
  with check (org_id = (select current_org_id()));

drop policy if exists task_attachments_insert on storage.objects;
create policy task_attachments_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = (select current_org_id())::text
    and ((select is_admin_or_hr()) or (storage.foldername(name))[2] in (select (my_task_department_ids())::text) or is_department_head(((storage.foldername(name))[2])::uuid))
  );

create or replace function public.task_board_members(p_department_id uuid)
returns table(employee_id uuid, first_name text, last_name text, nickname text, photo_url text, is_head boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.first_name, e.last_name, e.nickname, e.photo_url, e.id = d.head_employee_id
  from departments d
  join employees e on e.org_id = d.org_id
   and (e.department_id = d.id or e.id = d.head_employee_id
        or exists (select 1 from employee_departments x where x.employee_id = e.id and x.department_id = d.id))
  where d.id = p_department_id
    and d.org_id = current_org_id()
    and (is_admin_or_hr() or current_employee_id() is not null)
    and e.deleted_at is null and e.employment_status in ('active', 'probation')
  order by (e.id = d.head_employee_id) desc, e.first_name;
$$;

-- คะนิ้ง (90031) and สมาย (90064) also work in บัญชี
insert into public.employee_departments (employee_id, department_id, org_id)
select e.id, d.id, e.org_id
  from employees e join departments d on d.org_id = e.org_id and d.name = 'บัญชี' and d.deleted_at is null
 where e.employee_code in ('90031', '90064') and e.deleted_at is null
on conflict do nothing;

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
                   and (e.department_id = new.department_id or e.id = d.head_employee_id
                        or exists (select 1 from employee_departments x where x.employee_id = e.id and x.department_id = new.department_id))) then
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
  if (new.weight is distinct from old.weight or new.assignee_employee_id is distinct from old.assignee_employee_id)
     and not (v_head or v_admin) then
    raise exception 'น้ำหนักงานและผู้รับผิดชอบ แก้ได้เฉพาะหัวหน้าแผนก';
  end if;
  -- Due date: the head sets / changes it; the assignee may set it ONCE, while the card has no date yet.
  if new.due_date is distinct from old.due_date
     and not (v_head or v_admin or (v_owner and old.status in ('todo', 'doing'))) then
    raise exception 'กำหนดส่งแก้ได้เฉพาะหัวหน้า หรือเจ้าของงานก่อนส่งตรวจ';
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
