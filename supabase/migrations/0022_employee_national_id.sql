-- Nineall HR — plaintext national ID field (national_id_masked was schema-only and
-- never wired to any UI; this is the actual editable field employees/admin fill in).

alter table employees
  add column if not exists national_id text;
