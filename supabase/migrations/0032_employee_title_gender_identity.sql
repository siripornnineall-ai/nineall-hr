-- Nineall HR — title prefix + gender identity fields (matches the reference product's
-- personal-info section: คำนำหน้าชื่อ / เพศ / เพศสภาพ). `gender` already existed in the
-- original schema but was never wired to any UI; title_prefix and gender_identity are new.
-- Neither is added to restrict_employee_self_update()'s blocked-column list, so — like
-- the pre-existing gender/date_of_birth/phone/etc columns — employees can self-edit
-- these too, consistent with that trigger's own stated scope ("personal contact fields").

alter table employees
  add column if not exists title_prefix text,
  add column if not exists gender_identity text;
