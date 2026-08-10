
-- Adds the payroll_admin role required by the Nineall HR master prompt (section 6),
-- and the more_information_required approval status (section 11).
-- Enum values must be added in their own transaction before they can be referenced.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'payroll_admin';
ALTER TYPE approval_status ADD VALUE IF NOT EXISTS 'more_information_required';
