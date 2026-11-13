-- Department task board (Trello-style) with a fair performance % (owner 2026-11-13).
--
-- * Each department has ONE head (departments.head_employee_id), chosen by HR / admin.
-- * The head and the members of a department can add cards to the department board.
-- * Columns: todo -> doing -> review (sent to the head) -> done.  'cancelled' cards are out of the score.
-- * ONLY the department head can approve a card as done (not HR / admin), and gives it a quality score 1-5.
--   Only the head (or HR / admin) sets the card's weight 1-5, its due date, its assignee, or cancels it.
-- * Score per card: possible = weight x 5;  earned = weight x quality, x 0.8 if it was sent for review after the
--   due date.  % = earned / possible over the cards that count in the period:
--     - done cards (period = due date, or approval date when there is no due date)
--     - unfinished cards whose due date has passed (they count as 0)
--   Unfinished cards that are not yet due, or have no due date, do not count either way.
-- All rules are enforced here (row-level security + triggers), not only in the apps.

alter table public.departments add column if not exists head_employee_id uuid references public.employees(id) on delete set null;

create table if not exists public.task_cards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  description text,
  status text not null default 'todo' check (status in ('todo', 'doing', 'review', 'done', 'cancelled')),
  assignee_employee_id uuid not null references public.employees(id) on delete cascade,
  created_by_employee_id uuid references public.employees(id) on delete set null,
  weight integer not null default 1 check (weight between 1 and 5),
  due_date date,
  position double precision not null default extract(epoch from now()),
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by_employee_id uuid references public.employees(id) on delete set null,
  quality integer check (quality between 1 and 5),
  is_late boolean,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_task_cards_dept on public.task_cards(department_id, status, position);
create index if not exists idx_task_cards_assignee on public.task_cards(assignee_employee_id, due_date);
create trigger trg_task_cards_updated_at before update on public.task_cards
  for each row execute function set_updated_at();

-- helpers ---------------------------------------------------------------------------------------------
create or replace function public.my_department_id()
returns uuid language sql stable security definer set search_path = public as $$
  select department_id from employees where id = current_employee_id();
$$;

create or replace function public.is_department_head(p_department_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from departments d where d.id = p_department_id and d.head_employee_id is not null
                 and d.head_employee_id = current_employee_id());
$$;

-- people on a department board (members + the head): employees cannot read other employees directly.
create or replace function public.task_board_members(p_department_id uuid)
returns table(employee_id uuid, first_name text, last_name text, nickname text, photo_url text, is_head boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.first_name, e.last_name, e.nickname, e.photo_url, e.id = d.head_employee_id
  from departments d
  join employees e on e.org_id = d.org_id and (e.department_id = d.id or e.id = d.head_employee_id)
  where d.id = p_department_id
    and d.org_id = current_org_id()
    and (is_admin_or_hr() or d.id = my_department_id() or d.head_employee_id = current_employee_id())
    and e.deleted_at is null and e.employment_status in ('active', 'probation')
  order by (e.id = d.head_employee_id) desc, e.first_name;
$$;

-- row-level security ---------------------------------------------------------------------------------
alter table public.task_cards enable row level security;

create policy task_cards_select on public.task_cards for select
  using (org_id = (select current_org_id())
         and ((select is_admin_or_hr()) or department_id = (select my_department_id())
              or is_department_head(department_id) or assignee_employee_id = (select current_employee_id())));

create policy task_cards_insert on public.task_cards for insert
  with check (org_id = (select current_org_id())
              and ((select is_admin_or_hr()) or department_id = (select my_department_id()) or is_department_head(department_id)));

create policy task_cards_update on public.task_cards for update
  using (org_id = (select current_org_id())
         and ((select is_admin_or_hr()) or department_id = (select my_department_id()) or is_department_head(department_id)))
  with check (org_id = (select current_org_id()));

create policy task_cards_delete on public.task_cards for delete
  using (org_id = (select current_org_id())
         and ((select is_admin_or_hr()) or is_department_head(department_id)
              or (created_by_employee_id = (select current_employee_id()) and status in ('todo', 'doing'))));

-- rules ----------------------------------------------------------------------------------------------
create or replace function public.guard_task_card()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := current_employee_id();
  v_head boolean;
  v_admin boolean := coalesce(is_admin_or_hr(), false);
  v_owner boolean;
  v_submitted_day date;
begin
  -- direct database work (migrations, service jobs) is not a user action
  if auth.uid() is null then
    return new;
  end if;

  v_head := is_department_head(new.department_id);

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
      new.weight := 1;  -- the head sets the weight
      if new.assignee_employee_id is distinct from v_me then
        raise exception 'ลูกทีมเพิ่มการ์ดได้เฉพาะงานของตัวเอง หัวหน้าแผนกเป็นผู้มอบหมายงานให้คนอื่น';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE
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
  if (new.quality is distinct from old.quality or new.review_note is distinct from old.review_note) and not v_head then
    raise exception 'ให้คะแนนและความเห็นได้เฉพาะหัวหน้าแผนก';
  end if;
  if (new.approved_at is distinct from old.approved_at or new.approved_by_employee_id is distinct from old.approved_by_employee_id
      or new.is_late is distinct from old.is_late or new.submitted_at is distinct from old.submitted_at)
     and new.status is not distinct from old.status then
    raise exception 'แก้ไขข้อมูลการอนุมัติไม่ได้';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'done' then
      if not v_head then
        raise exception 'เฉพาะหัวหน้าแผนกเท่านั้นที่อนุมัติงานให้เสร็จได้';
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
      if not v_head then
        raise exception 'เฉพาะหัวหน้าแผนกเท่านั้นที่เปิดงานที่เสร็จแล้วกลับมาได้';
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
      -- back from review: the head sends it back, or the owner takes it back before it is checked
      if not (v_owner or v_head) then
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
$$;

create trigger trg_task_cards_guard before insert or update on public.task_cards
  for each row execute function public.guard_task_card();

-- notifications --------------------------------------------------------------------------------------
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
begin
  select head_employee_id into v_head from departments where id = new.department_id;

  if tg_op = 'INSERT' then
    if new.assignee_employee_id is distinct from new.created_by_employee_id then
      select id into v_profile from profiles where employee_id = new.assignee_employee_id and is_active limit 1;
      v_type := 'task_assigned'; v_title := 'มีงานใหม่มอบหมายให้คุณ';
      v_body := new.title || coalesce(' · กำหนดส่ง ' || to_char(new.due_date, 'DD/MM/YYYY'), '');
    end if;
  elsif new.status is distinct from old.status then
    if new.status = 'review' and v_head is not null then
      select id into v_profile from profiles where employee_id = v_head and is_active limit 1;
      v_type := 'task_review_requested'; v_title := 'มีงานรอคุณตรวจ';
      v_body := new.title || ' · ' || coalesce((select coalesce(nullif(nickname, ''), first_name) from employees where id = new.assignee_employee_id), '');
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

create trigger trg_task_cards_notify after insert or update of status on public.task_cards
  for each row execute function public.notify_task_card();

-- score ----------------------------------------------------------------------------------------------
-- Runs with the caller's rights, so everyone gets the scores of the cards they are allowed to see.
create or replace function public.task_scores(p_from date, p_to date)
returns table(department_id uuid, employee_id uuid, cards_counted integer, done_count integer, late_count integer,
              overdue_open_count integer, earned numeric, possible numeric, percent numeric)
language sql
stable
set search_path = public
as $$
  with c as (
    select t.*,
           case when t.status = 'done' then coalesce(t.due_date, (t.approved_at at time zone 'Asia/Bangkok')::date) else t.due_date end as period_day
    from task_cards t
    where t.status <> 'cancelled'
      and (t.status = 'done' or (t.due_date is not null and t.due_date < (now() at time zone 'Asia/Bangkok')::date))
  )
  select c.department_id, c.assignee_employee_id,
         count(*)::int,
         count(*) filter (where c.status = 'done')::int,
         count(*) filter (where c.status = 'done' and c.is_late)::int,
         count(*) filter (where c.status <> 'done')::int,
         sum(case when c.status = 'done' then c.weight * c.quality * (case when c.is_late then 0.8 else 1 end) else 0 end)::numeric,
         sum(c.weight * 5)::numeric,
         round(100 * sum(case when c.status = 'done' then c.weight * c.quality * (case when c.is_late then 0.8 else 1 end) else 0 end)
               / nullif(sum(c.weight * 5), 0), 1)
  from c
  where c.period_day between p_from and p_to
  group by c.department_id, c.assignee_employee_id;
$$;

grant execute on function public.task_scores(date, date) to authenticated;
grant execute on function public.task_board_members(uuid) to authenticated;
