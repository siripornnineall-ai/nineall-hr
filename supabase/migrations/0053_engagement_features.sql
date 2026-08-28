-- Employee engagement features: a company-wide "who's late" leaderboard, a peer-kudos
-- ("cookie") system, and lightweight social profiles with ephemeral 24h status notes,
-- reactions, and comments. All new content here is intentionally visible org-wide
-- (that's the point — visibility drives the engagement), but kept separate from
-- attendance_records itself: employees never get direct SELECT on colleagues' raw
-- clock-in/out/GPS data, only the aggregated late-minutes figures exposed by the two
-- functions below.

alter table employees add column if not exists intro_bio text;

-- ---------- late leaderboard (reads attendance_records, exposes only aggregates) ----------
create or replace function get_late_leaderboard(p_month_start date, p_month_end date)
returns table (employee_id uuid, employee_code text, first_name text, last_name text, nickname text, photo_url text, total_late_minutes bigint, late_days bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url,
    sum(ar.late_minutes)::bigint, count(*) filter (where ar.late_minutes > 0)::bigint
  from attendance_records ar
  join employees e on e.id = ar.employee_id
  where ar.org_id = current_org_id()
    and ar.work_date >= p_month_start and ar.work_date <= p_month_end
    and ar.late_minutes > 0
    and e.deleted_at is null
  group by e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url
  order by sum(ar.late_minutes) desc
  limit 3;
$$;
revoke all on function get_late_leaderboard(date, date) from public;
grant execute on function get_late_leaderboard(date, date) to authenticated;

-- Per-day late-minutes only for one employee's monthly detail (no clock times/GPS) — what
-- the leaderboard click-through shows a colleague, as opposed to the full clock in/out
-- detail admin-web's own /attendance/[employeeId] page shows to HR.
create or replace function get_employee_late_detail(p_employee_id uuid, p_month_start date, p_month_end date)
returns table (work_date date, late_minutes integer, status attendance_status)
language sql
stable
security definer
set search_path to 'public'
as $$
  select ar.work_date, ar.late_minutes, ar.status
  from attendance_records ar
  where ar.org_id = current_org_id()
    and ar.employee_id = p_employee_id
    and ar.work_date >= p_month_start and ar.work_date <= p_month_end
  order by ar.work_date desc;
$$;
revoke all on function get_employee_late_detail(uuid, date, date) from public;
grant execute on function get_employee_late_detail(uuid, date, date) to authenticated;

-- ---------- kindness cookies ----------
create table if not exists kindness_cookies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  giver_employee_id uuid not null references employees(id) on delete cascade,
  receiver_employee_id uuid not null references employees(id) on delete cascade,
  month date not null,
  created_at timestamptz not null default now(),
  check (giver_employee_id <> receiver_employee_id)
);
create index if not exists idx_kindness_cookies_giver_month on kindness_cookies(giver_employee_id, month);
create index if not exists idx_kindness_cookies_receiver_month on kindness_cookies(receiver_employee_id, month);

create or replace function enforce_cookie_monthly_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  select count(*) into v_count from kindness_cookies
    where giver_employee_id = new.giver_employee_id and month = new.month;
  if v_count >= 5 then
    raise exception 'COOKIE_LIMIT_REACHED: only 5 cookies allowed per person per month' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger trg_enforce_cookie_monthly_limit before insert on kindness_cookies
  for each row execute function enforce_cookie_monthly_limit();

alter table kindness_cookies enable row level security;
create policy kindness_cookies_select on kindness_cookies for select
  using (org_id = current_org_id());
create policy kindness_cookies_insert on kindness_cookies for insert
  with check (org_id = current_org_id() and is_self(giver_employee_id));

-- ---------- ephemeral status notes (Instagram/Facebook Notes-style, 24h) ----------
create table if not exists employee_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  text text not null check (char_length(text) <= 100),
  created_at timestamptz not null default now()
);
create index if not exists idx_employee_notes_employee_created on employee_notes(employee_id, created_at desc);

alter table employee_notes enable row level security;
create policy employee_notes_select on employee_notes for select
  using (org_id = current_org_id());
create policy employee_notes_insert on employee_notes for insert
  with check (org_id = current_org_id() and is_self(employee_id));
create policy employee_notes_delete on employee_notes for delete
  using (org_id = current_org_id() and is_self(employee_id));

create table if not exists note_reactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  note_id uuid not null references employee_notes(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (note_id, employee_id)
);

alter table note_reactions enable row level security;
create policy note_reactions_select on note_reactions for select
  using (org_id = current_org_id());
create policy note_reactions_insert on note_reactions for insert
  with check (org_id = current_org_id() and is_self(employee_id));
create policy note_reactions_update on note_reactions for update
  using (org_id = current_org_id() and is_self(employee_id))
  with check (org_id = current_org_id() and is_self(employee_id));
create policy note_reactions_delete on note_reactions for delete
  using (org_id = current_org_id() and is_self(employee_id));

create table if not exists note_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  note_id uuid not null references employee_notes(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  text text not null check (char_length(text) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists idx_note_comments_note on note_comments(note_id, created_at);

alter table note_comments enable row level security;
create policy note_comments_select on note_comments for select
  using (org_id = current_org_id());
create policy note_comments_insert on note_comments for insert
  with check (org_id = current_org_id() and is_self(employee_id));
create policy note_comments_delete on note_comments for delete
  using (org_id = current_org_id() and is_self(employee_id));
