-- Goals and KPIs per employee (owner 2026-11-10): employees write their own goals / KPIs in the employee app;
-- admin / HR can see everyone's and add (and edit / delete) goals and KPIs for any employee.
--   * source = 'employee' : written by the employee. The employee can edit / delete it freely.
--   * source = 'admin'    : set by admin / HR. The employee can only update progress (current_value) and status.
-- Line managers can read their team's rows.

create table if not exists employee_goals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  kind text not null default 'goal' check (kind in ('goal', 'kpi')),
  title text not null,
  description text,
  target_value text,          -- free text, e.g. "100 ออเดอร์/วัน"
  current_value text,         -- progress, free text
  period text,                -- e.g. "ไตรมาส 4/2569"
  due_date date,
  status text not null default 'active' check (status in ('active', 'done', 'cancelled')),
  source text not null default 'employee' check (source in ('employee', 'admin')),
  created_by_employee_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_employee_goals_updated_at before update on employee_goals
  for each row execute function set_updated_at();
create index if not exists idx_employee_goals_employee on employee_goals(employee_id, created_at desc);
create index if not exists idx_employee_goals_org on employee_goals(org_id, created_at desc);

alter table employee_goals enable row level security;

create policy employee_goals_select on employee_goals for select
  using (org_id = (select current_org_id()) and ((select is_admin_or_hr()) or is_self(employee_id) or is_manager_of(employee_id)));

create policy employee_goals_insert on employee_goals for insert
  with check (org_id = (select current_org_id())
              and ((select is_admin_or_hr()) or (is_self(employee_id) and source = 'employee')));

create policy employee_goals_update on employee_goals for update
  using (org_id = (select current_org_id()) and ((select is_admin_or_hr()) or is_self(employee_id)))
  with check (org_id = (select current_org_id()) and ((select is_admin_or_hr()) or is_self(employee_id)));

create policy employee_goals_delete on employee_goals for delete
  using (org_id = (select current_org_id())
         and ((select is_admin_or_hr()) or (is_self(employee_id) and source = 'employee')));

-- Employees: cannot reassign a row to someone else or change who wrote it; on admin-set rows they may only change
-- progress and status.
create or replace function public.guard_employee_goals_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(is_admin_or_hr(), false) then
    return new;
  end if;
  if new.employee_id is distinct from old.employee_id or new.org_id is distinct from old.org_id
     or new.source is distinct from old.source or new.created_by_employee_id is distinct from old.created_by_employee_id then
    raise exception 'ไม่สามารถเปลี่ยนเจ้าของหรือที่มาของเป้าหมายได้';
  end if;
  if old.source = 'admin' and (
       new.kind is distinct from old.kind or new.title is distinct from old.title
       or new.description is distinct from old.description or new.target_value is distinct from old.target_value
       or new.period is distinct from old.period or new.due_date is distinct from old.due_date) then
    raise exception 'เป้าหมาย/KPI ที่ผู้ดูแลกำหนด แก้ไขได้เฉพาะความคืบหน้าและสถานะ';
  end if;
  return new;
end;
$$;
create trigger trg_employee_goals_guard before update on employee_goals
  for each row execute function public.guard_employee_goals_update();

-- Tell the employee when admin / HR adds a goal or KPI for them.
create or replace function public.notify_employee_goal_assigned()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_profile_id uuid;
begin
  if new.source <> 'admin' then
    return new;
  end if;
  select id into v_profile_id from profiles where employee_id = new.employee_id limit 1;
  if v_profile_id is null then
    return new;
  end if;
  insert into notifications (org_id, profile_id, type, title, body, data, channel)
  values (new.org_id, v_profile_id, 'employee_goal_assigned',
          case when new.kind = 'kpi' then 'มี KPI ใหม่สำหรับคุณ' else 'มีเป้าหมายใหม่สำหรับคุณ' end,
          new.title || coalesce(' · เป้า ' || new.target_value, ''),
          jsonb_build_object('employee_goal_id', new.id), 'in_app');
  return new;
end;
$$;
create trigger trg_employee_goals_notify after insert on employee_goals
  for each row execute function public.notify_employee_goal_assigned();
