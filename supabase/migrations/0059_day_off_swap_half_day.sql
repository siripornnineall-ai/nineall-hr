-- Same half-day support as holiday_swap_requests (migration 0051): some employees only
-- need to work half of their normal day off, not the whole day.
alter table day_off_swap_requests
  add column if not exists unit text not null default 'full_day' check (unit in ('full_day','half_day')),
  add column if not exists period text check (period in ('morning','afternoon'));
