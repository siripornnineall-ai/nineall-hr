-- Nineall HR — training records (Phase 3 ByteHR parity). Admin logs a training/course an
-- employee attended; employee sees their own history read-only. No approval workflow
-- needed here (it's a record of something that already happened, not a request).

create table if not exists training_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  title text not null,
  provider text,
  training_date date not null,
  hours numeric(5,2),
  certificate_file_path text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_training_records_updated_at before update on training_records
  for each row execute function set_updated_at();
create index if not exists idx_training_records_employee on training_records(employee_id, training_date desc);

alter table training_records enable row level security;
create policy training_records_select on training_records for select
  using (org_id = current_org_id() and (is_admin_or_hr() or is_self(employee_id) or is_manager_of(employee_id)));
create policy training_records_write on training_records for all
  using (org_id = current_org_id() and is_admin_or_hr())
  with check (org_id = current_org_id() and is_admin_or_hr());
