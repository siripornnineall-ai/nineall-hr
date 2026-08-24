-- Raises the 0%-tax threshold from ~12,500/month to 26,000/month by inserting a new
-- effective-dated policy_settings row for tax_bracket (see loadPolicyConfig: most recent
-- effective row wins, so this preserves historical brackets for already-run payroll periods).
insert into policy_settings (org_id, setting_type, value, effective_date)
values (
  '00000000-0000-0000-0000-000000000001',
  'tax_bracket',
  '[
    {"rate":0,"uptoSatang":31200000},
    {"rate":0.05,"uptoSatang":46200000},
    {"rate":0.1,"uptoSatang":66200000},
    {"rate":0.15,"uptoSatang":91200000},
    {"rate":0.2,"uptoSatang":116200000},
    {"rate":0.25,"uptoSatang":null}
  ]'::jsonb,
  current_date
)
on conflict do nothing;
