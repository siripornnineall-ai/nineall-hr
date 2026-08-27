-- Some employees only need to work HALF of a public holiday and take the matching half
-- (same morning/afternoon) off on their substitute date instead of a full day each way.
alter table holiday_swap_requests
  add column if not exists unit text not null default 'full_day' check (unit in ('full_day','half_day')),
  add column if not exists period text check (period in ('morning','afternoon'));
