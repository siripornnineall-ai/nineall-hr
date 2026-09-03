insert into storage.buckets (id, name, public) values ('output-photos', 'output-photos', false)
on conflict (id) do nothing;

create policy output_photos_read on storage.objects
  for select using (bucket_id = 'output-photos' and storage_path_org_id(name) = current_org_id());

create policy output_photos_insert on storage.objects
  for insert with check (
    bucket_id = 'output-photos'
    and storage_path_org_id(name) = current_org_id()
    and (is_admin_or_hr() or storage_path_employee_id(name) = current_employee_id())
  );

create policy output_photos_delete on storage.objects
  for delete using (
    bucket_id = 'output-photos'
    and storage_path_org_id(name) = current_org_id()
    and (is_admin_or_hr() or storage_path_employee_id(name) = current_employee_id())
  );
