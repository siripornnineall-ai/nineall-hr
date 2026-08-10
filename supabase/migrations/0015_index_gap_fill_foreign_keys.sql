
create index if not exists idx_translation_keys_org_id on public.translation_keys(org_id);
create index if not exists idx_translations_translation_key_id on public.translations(translation_key_id);
create index if not exists idx_translations_updated_by on public.translations(updated_by);
create index if not exists idx_translation_history_translation_id on public.translation_history(translation_id);
create index if not exists idx_translation_history_changed_by on public.translation_history(changed_by);
create index if not exists idx_devices_profile_id on public.devices(profile_id);
create index if not exists idx_consent_records_profile_id on public.consent_records(profile_id);
create index if not exists idx_loans_employee_id on public.loans(employee_id);
create index if not exists idx_loans_approved_by on public.loans(approved_by);
create index if not exists idx_loan_installments_loan_id on public.loan_installments(loan_id);
create index if not exists idx_loan_installments_payroll_calc_id on public.loan_installments(payroll_calc_id);
create index if not exists idx_loan_installments_due_period_id on public.loan_installments(due_period_id);
create index if not exists idx_custom_roles_org_id on public.custom_roles(org_id);
create index if not exists idx_custom_roles_created_by on public.custom_roles(created_by);
