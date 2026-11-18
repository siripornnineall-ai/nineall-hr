-- Optional proof of work on a task card (owner 2026-11-18): a link and/or one image the assignee attaches when finishing,
-- so the department head can see it while checking the card.
--   * task_cards.link_url / attachment_path (path inside the private bucket 'task-attachments': {org}/{dept}/{card}/{file});
--   * only the assignee (while todo / doing), the head or HR can change them;
--   * like the board itself (0153) the files are readable by everyone in the organization; uploads by the department's
--     people / head / HR; deletes by head / HR.

alter table public.task_cards
  add column if not exists link_url text,
  add column if not exists attachment_path text;

create or replace function public.guard_task_card_proof()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.link_url is distinct from old.link_url or new.attachment_path is distinct from old.attachment_path then
    if not (coalesce(is_admin_or_hr(), false)
            or is_department_head(new.department_id)
            or (old.assignee_employee_id = current_employee_id() and old.status in ('todo', 'doing'))) then
      raise exception 'แนบ/แก้ผลงานได้เฉพาะผู้รับผิดชอบก่อนส่งตรวจ หรือหัวหน้าแผนก';
    end if;
    if new.link_url is not null and new.link_url !~* '^https?://' then
      raise exception 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_task_cards_proof_guard on public.task_cards;
create trigger trg_task_cards_proof_guard before update on public.task_cards
  for each row execute function public.guard_task_card_proof();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-attachments', 'task-attachments', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

create policy task_attachments_read on storage.objects for select to authenticated
  using (bucket_id = 'task-attachments' and (storage.foldername(name))[1] = (select current_org_id())::text);

create policy task_attachments_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = (select current_org_id())::text
    and ((select is_admin_or_hr()) or (storage.foldername(name))[2] = (select my_department_id())::text or is_department_head(((storage.foldername(name))[2])::uuid))
  );

create policy task_attachments_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = (select current_org_id())::text
    and ((select is_admin_or_hr()) or is_department_head(((storage.foldername(name))[2])::uuid))
  );
