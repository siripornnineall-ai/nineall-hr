-- Reverts 0017's column-level GRANT restriction on `employees`. It turns out a pre-existing
-- trigger, restrict_employee_self_update() (BEFORE UPDATE, from an earlier part of this same
-- session), already solves the exact problem 0017 was trying to solve — and does it correctly:
-- it calls is_admin_or_hr() and allows everything through for HR/admin, only restricting
-- non-admin/hr self-edits to contact fields. A column GRANT can't express "only if you're also
-- HR" (it applies to the whole `authenticated` Postgres role, which every app role shares), so
-- 0017's restriction was both redundant with the trigger AND actively wrong — it blocked HR's
-- legitimate employment_status updates (found while building the offboard-employee feature,
-- which had to route around it via a security-definer RPC as a workaround). The trigger is the
-- right tool for this; restore the plain broad grant and let it do the job alone.

grant update on public.employees to authenticated;
