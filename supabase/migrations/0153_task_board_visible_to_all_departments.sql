-- Owner 2026-11-13: transparency — every employee can SEE every department's task board, its members and everyone's
-- scores (read-only). Adding / moving / approving cards stays limited to the department (and the head) by the existing
-- insert / update policies and the guard_task_card() trigger. task_scores() is security invoker, so it follows this
-- select policy.
drop policy if exists task_cards_select on public.task_cards;
create policy task_cards_select on public.task_cards for select
  using (org_id = (select current_org_id()) and (select current_employee_id()) is not null);

create or replace function public.task_board_members(p_department_id uuid)
returns table(employee_id uuid, first_name text, last_name text, nickname text, photo_url text, is_head boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.first_name, e.last_name, e.nickname, e.photo_url, e.id = d.head_employee_id
  from departments d
  join employees e on e.org_id = d.org_id and (e.department_id = d.id or e.id = d.head_employee_id)
  where d.id = p_department_id
    and d.org_id = current_org_id()
    and (is_admin_or_hr() or current_employee_id() is not null)
    and e.deleted_at is null and e.employment_status in ('active', 'probation')
  order by (e.id = d.head_employee_id) desc, e.first_name;
$$;
