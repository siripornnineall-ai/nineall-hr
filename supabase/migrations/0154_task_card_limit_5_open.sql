-- Owner 2026-11-13: everyone (heads included) can have at most 5 open cards they created at the same time.
-- "Open" = todo / doing / review; done and cancelled cards free a slot.
create or replace function public.limit_task_cards_per_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or new.created_by_employee_id is null then
    return new;
  end if;
  if (select count(*) from task_cards
       where created_by_employee_id = new.created_by_employee_id and status in ('todo', 'doing', 'review')) >= 5 then
    raise exception 'เพิ่มการ์ดได้สูงสุด 5 ใบที่ยังไม่เสร็จ กรุณาทำการ์ดเดิมให้เสร็จหรือลบก่อน';
  end if;
  return new;
end;
$$;

-- Runs after guard_task_card (triggers fire alphabetically) so created_by_employee_id is already set to the caller.
drop trigger if exists trg_task_cards_limit on public.task_cards;
create trigger trg_task_cards_limit before insert on public.task_cards
  for each row execute function public.limit_task_cards_per_creator();
