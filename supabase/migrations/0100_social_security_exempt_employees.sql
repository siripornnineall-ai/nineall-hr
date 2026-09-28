-- Owners / family members who are not registered with the Social Security Office should
-- have no SSO contribution computed (2026-09-28: employees 90012, 90016, 90019 — they are
-- already tax_exempt). Same shape as tax_exempt: a flag on the employee, honoured by the
-- payroll calculation and editable on the employee form.

alter table employees add column if not exists social_security_exempt boolean not null default false;

update employees set social_security_exempt = true where employee_code in ('90012', '90016', '90019') and deleted_at is null;
