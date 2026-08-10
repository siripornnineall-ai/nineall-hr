-- Nineall HR — announcements, notifications, file registry

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  body text not null,
  attachment_file_paths jsonb not null default '[]'::jsonb,
  target_type text not null default 'all', -- all | branch | department | team | employee
  target_ids uuid[] not null default '{}',
  publish_at timestamptz not null default now(),
  expire_at timestamptz,
  status text not null default 'published', -- draft | published | expired
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
create trigger trg_announcements_updated_at before update on announcements
  for each row execute function set_updated_at();
create index if not exists idx_announcements_org on announcements(org_id, publish_at desc);

create table if not exists announcement_reads (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references announcements(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (announcement_id, employee_id)
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  type text not null, -- leave_new | leave_decided | ot_new | ot_decided | time_correction | clock_out_reminder | payslip_ready | announcement
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  channel notification_channel not null default 'push',
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_profile on notifications(profile_id, is_read, created_at desc);

create table if not exists uploaded_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  bucket text not null,
  file_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  entity_type text,
  entity_id uuid,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_uploaded_files_entity on uploaded_files(entity_type, entity_id);
