-- Checklist items inside a task card (owner 2026-11-18): a "งานหัวข้อ" (e.g. ทำการตลาด) can hold several sub-items
-- (ยิงแอด, ศึกษาตลาด, ...). Each item is its own card that moves ต้องทำ -> กำลังทำ -> รอหัวหน้าตรวจ -> เสร็จ and is approved by
-- the department head with stars like any other card. The heading is a container row (is_group = true): it is not shown
-- on the board, not scored, and does not take a weight; items point at it with parent_id.
--   * the "5 open cards per person" limit counts top-level cards and headings that still have an open item, not each item;
--   * assignment notifications skip the heading row (the items notify as usual).

alter table public.task_cards
  add column if not exists parent_id uuid references public.task_cards(id) on delete cascade,
  add column if not exists is_group boolean not null default false;
create index if not exists idx_task_cards_parent on public.task_cards(parent_id);

create or replace function public.task_card_group_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.task_cards%rowtype;
begin
  if new.parent_id is not null then
    select * into p from public.task_cards where id = new.parent_id;
    if not found or not p.is_group or p.department_id <> new.department_id or p.org_id <> new.org_id then
      raise exception 'รายการย่อยต้องอยู่ในงานหัวข้อของแผนกเดียวกัน';
    end if;
    if new.is_group then
      raise exception 'รายการย่อยเป็นหัวข้อไม่ได้';
    end if;
  end if;
  if new.is_group and tg_op = 'INSERT' then
    new.status := 'todo';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_task_cards_group_rules on public.task_cards;
create trigger trg_task_cards_group_rules before insert or update on public.task_cards
  for each row execute function public.task_card_group_rules();

create or replace function public.limit_task_cards_per_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or new.created_by_employee_id is null or new.parent_id is not null then
    return new;
  end if;
  if (select count(*) from task_cards c
       where c.created_by_employee_id = new.created_by_employee_id and c.parent_id is null
         and ((not c.is_group and c.status in ('todo', 'doing', 'review'))
              or (c.is_group and exists (select 1 from task_cards k where k.parent_id = c.id and k.status in ('todo', 'doing', 'review'))))) >= 5 then
    raise exception 'เพิ่มการ์ดได้สูงสุด 5 ใบที่ยังไม่เสร็จ กรุณาทำการ์ดเดิมให้เสร็จหรือลบก่อน';
  end if;
  return new;
end;
$$;

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
    where t.status <> 'cancelled' and not t.is_group
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
