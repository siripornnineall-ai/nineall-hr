-- Nineall HR — recruitment (Phase 3 ByteHR parity): job vacancies + candidate pipeline.
-- Vacancies get a public share link (open vacancies are publicly readable, no login,
-- for the external application page); candidates are PII and stay admin/HR-only —
-- the public application form inserts via a service-role server action instead of a
-- public RLS insert policy, so anonymous traffic never gets a direct table grant.

create table if not exists job_vacancies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  department_id uuid references departments(id) on delete set null,
  job_position_id uuid references job_positions(id) on delete set null,
  description text,
  headcount integer not null default 1,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_job_vacancies_updated_at before update on job_vacancies
  for each row execute function set_updated_at();

create table if not exists job_candidates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  vacancy_id uuid not null references job_vacancies(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  resume_file_path text,
  cover_note text,
  status text not null default 'applied' check (status in ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_job_candidates_updated_at before update on job_candidates
  for each row execute function set_updated_at();
create index if not exists idx_job_candidates_vacancy on job_candidates(vacancy_id, status);

alter table job_vacancies enable row level security;
create policy job_vacancies_public_select on job_vacancies for select
  to anon, authenticated
  using (status = 'open');
create policy job_vacancies_org_select on job_vacancies for select
  using (org_id = current_org_id() and is_admin_or_hr());
create policy job_vacancies_write on job_vacancies for all
  using (org_id = current_org_id() and is_admin_or_hr())
  with check (org_id = current_org_id() and is_admin_or_hr());

alter table job_candidates enable row level security;
create policy job_candidates_select on job_candidates for select
  using (org_id = current_org_id() and is_admin_or_hr());
create policy job_candidates_write on job_candidates for all
  using (org_id = current_org_id() and is_admin_or_hr())
  with check (org_id = current_org_id() and is_admin_or_hr());
