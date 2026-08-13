-- Employee self-service profile editing: photo, name, bio.
-- `employees_update_self` (id = current_employee_id()) already existed as a row-level policy,
-- but the table-level GRANT for `authenticated` was unrestricted UPDATE on every column —
-- meaning an employee could already update employment_status, department_id, hire_date, etc.
-- on their own row via a direct API call, not just through this app's UI. Closing that gap here
-- with a column-level GRANT alongside the new bio field, rather than shipping a new employee-
-- facing feature on top of a pre-existing over-broad permission.
--
-- Safe to do now specifically because admin-web has no "edit employee" UI yet (session 1 status:
-- "Edit form not yet built") — nothing today relies on the `authenticated` role having broader
-- UPDATE access. When that HR-facing edit form is built, it should go through the service-role
-- client (apps/admin-web/src/lib/supabase/admin.ts), which bypasses RLS/grants entirely, same
-- pattern already used for employee account creation.

alter table public.employees add column if not exists bio text;

revoke update on public.employees from authenticated;
grant update (first_name, last_name, nickname, photo_url, bio, phone, personal_email, address) on public.employees to authenticated;
