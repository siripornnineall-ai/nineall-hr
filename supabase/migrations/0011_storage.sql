-- Nineall HR — private storage buckets
-- All buckets are private. Files are only ever served via short-lived signed URLs
-- created server-side (Edge Function / server action), never public URLs.
-- Path convention: {org_id}/{employee_id}/{filename} — enforced by the policies below.

insert into storage.buckets (id, name, public)
values
  ('selfies', 'selfies', false),
  ('documents', 'documents', false),
  ('payslips', 'payslips', false),
  ('attachments', 'attachments', false),
  ('avatars', 'avatars', false),
  ('announcements', 'announcements', false)
on conflict (id) do nothing;

-- helper: first path segment is the org_id, second is the employee_id
create or replace function storage_path_org_id(object_name text)
returns uuid language sql immutable set search_path = public as $$
  select nullif(split_part(object_name, '/', 1), '')::uuid;
$$;

create or replace function storage_path_employee_id(object_name text)
returns uuid language sql immutable set search_path = public as $$
  select nullif(split_part(object_name, '/', 2), '')::uuid;
$$;

do $$
declare
  b text;
begin
  foreach b in array array['selfies', 'documents', 'payslips', 'attachments', 'avatars', 'announcements']
  loop
    execute format($p$
      create policy %I on storage.objects for select to authenticated
      using (
        bucket_id = %L
        and storage_path_org_id(name) = current_org_id()
        and (is_admin_or_hr() or storage_path_employee_id(name) = current_employee_id() or is_manager_of(storage_path_employee_id(name)))
      );
    $p$, b || '_read', b);

    execute format($p$
      create policy %I on storage.objects for insert to authenticated
      with check (
        bucket_id = %L
        and storage_path_org_id(name) = current_org_id()
        and (is_admin_or_hr() or storage_path_employee_id(name) = current_employee_id())
      );
    $p$, b || '_insert', b);

    execute format($p$
      create policy %I on storage.objects for delete to authenticated
      using (
        bucket_id = %L
        and storage_path_org_id(name) = current_org_id()
        and is_admin_or_hr()
      );
    $p$, b || '_delete', b);
  end loop;
end $$;
