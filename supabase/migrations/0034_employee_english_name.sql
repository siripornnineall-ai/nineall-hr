-- Nineall HR — separate English name fields (first_name_en/last_name_en), matching the
-- reference product's "First Name / First Name Thai" split. first_name/last_name stay
-- exactly as used everywhere today (whatever the employee's primary display name is,
-- Thai or English) — these are additive, optional fields, not a rename/restructure.

alter table employees
  add column if not exists first_name_en text,
  add column if not exists last_name_en text;
