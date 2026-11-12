-- Nationality on the employee profile (owner 2026-11-13). Optional text; filled in by HR on the new / edit employee forms.
alter table public.employees add column if not exists nationality text;
