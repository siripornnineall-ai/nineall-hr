-- Nineall HR — expense reimbursement requests (eClaims), mirrors overtime_requests'
-- shape/RLS pattern exactly: employee submits as pending, admin/HR/manager decides,
-- create_first_approval_step already handles any request_type generically.

create table if not exists reimbursement_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  expense_date date not null,
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  description text,
  receipt_file_path text,
  status approval_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_reimbursement_requests_updated_at before update on reimbursement_requests
  for each row execute function set_updated_at();
create trigger trg_reimbursement_first_approval after insert on reimbursement_requests
  for each row execute function create_first_approval_step('reimbursement');
create index if not exists idx_reimbursement_requests_employee on reimbursement_requests(employee_id, expense_date desc);

alter table reimbursement_requests enable row level security;
create policy reimbursement_requests_select on reimbursement_requests for select
  using (org_id = current_org_id() and (is_admin_or_hr() or is_self(employee_id) or is_manager_of(employee_id)));
create policy reimbursement_requests_insert on reimbursement_requests for insert
  with check (org_id = current_org_id() and is_self(employee_id) and status = 'pending');
create policy reimbursement_requests_update_owner on reimbursement_requests for update
  using (org_id = current_org_id() and is_self(employee_id) and status = 'pending')
  with check (org_id = current_org_id() and is_self(employee_id));
create policy reimbursement_requests_decide on reimbursement_requests for update
  using (org_id = current_org_id() and (is_admin_or_hr() or is_manager_of(employee_id)))
  with check (org_id = current_org_id() and (is_admin_or_hr() or is_manager_of(employee_id)));
