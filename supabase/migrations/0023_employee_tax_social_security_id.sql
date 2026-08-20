-- Nineall HR — separate tax ID and social security number fields.
-- For foreign (non-Thai) employees these are two different numbers; the system
-- previously only had one identity field (national_id, added in 0022). The old
-- national_id_masked/tax_id_masked/social_security_id_masked columns from 0002 were
-- schema-only and never wired to any UI (same situation 0022 already fixed for
-- national_id), so they're dropped here rather than reused.

alter table employees
  add column if not exists tax_id text,
  add column if not exists social_security_id text;

alter table employees
  drop column if exists national_id_masked,
  drop column if exists tax_id_masked,
  drop column if exists social_security_id_masked;
