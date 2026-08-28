-- For an employee with no regular weekly day off at all (works every day per their
-- schedule) — she confirmed no make-up/compensation day is required, so this is a plain
-- "grant this one date off" request rather than a swap. Reuses day_off_swap_requests
-- instead of a new table: original_date is now optional, meaning "just this date off,
-- nothing traded" when null.
alter table day_off_swap_requests
  alter column original_date drop not null,
  drop constraint if exists day_off_swap_requests_check,
  add constraint day_off_swap_requests_check check (original_date is null or original_date <> substitute_date);
