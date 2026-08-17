-- Nineall HR — structured ID-card / current address fields for employees

alter table employees
  add column if not exists id_card_address jsonb,
  add column if not exists current_address jsonb;
