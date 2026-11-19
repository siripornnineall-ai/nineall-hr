-- Several images per card (owner 2026-11-19): task_cards.attachment_paths text[] (max 10) replaces the single attachment_path
-- (kept only as the old column; existing single images were copied into the new array). (Applied to production.)
alter table public.task_cards add column if not exists attachment_paths text[] not null default '{}';
update public.task_cards set attachment_paths = array[attachment_path] where attachment_path is not null and attachment_paths = '{}';

create or replace function public.guard_task_card_proof()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.link_url is distinct from old.link_url or new.attachment_path is distinct from old.attachment_path
     or new.attachment_paths is distinct from old.attachment_paths then
    if not (coalesce(is_admin_or_hr(), false)
            or is_department_head(new.department_id)
            or (old.assignee_employee_id = current_employee_id() and old.status in ('todo', 'doing'))) then
      raise exception 'แนบ/แก้ผลงานได้เฉพาะผู้รับผิดชอบก่อนส่งตรวจ หรือหัวหน้าแผนก';
    end if;
    if new.link_url is not null and new.link_url !~* '^https?://' then
      raise exception 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://';
    end if;
    if coalesce(array_length(new.attachment_paths, 1), 0) > 10 then
      raise exception 'แนบรูปได้ไม่เกิน 10 รูปต่อรายการ';
    end if;
  end if;
  return new;
end;
$$;
