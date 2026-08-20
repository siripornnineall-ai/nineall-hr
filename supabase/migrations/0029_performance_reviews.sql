-- Nineall HR — performance reviews / KPI (Phase 3 ByteHR parity). Admin records a review
-- for an employee covering a period; employee sees their own reviews read-only.

create table if not exists performance_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  review_period text not null,
  rating integer not null check (rating between 1 and 5),
  strengths text,
  improvements text,
  goals_next_period text,
  reviewer_employee_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_performance_reviews_updated_at before update on performance_reviews
  for each row execute function set_updated_at();
create index if not exists idx_performance_reviews_employee on performance_reviews(employee_id, created_at desc);

alter table performance_reviews enable row level security;
create policy performance_reviews_select on performance_reviews for select
  using (org_id = current_org_id() and (is_admin_or_hr() or is_self(employee_id) or is_manager_of(employee_id)));
create policy performance_reviews_write on performance_reviews for all
  using (org_id = current_org_id() and (is_admin_or_hr() or is_manager_of(employee_id)))
  with check (org_id = current_org_id() and (is_admin_or_hr() or is_manager_of(employee_id)));
