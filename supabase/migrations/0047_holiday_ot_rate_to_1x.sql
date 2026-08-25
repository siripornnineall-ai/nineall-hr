-- Lowers holiday OT pay from 3x to 1x (company only pays 1x for public-holiday OT),
-- via a new effective-dated policy_settings row (see loadPolicyConfig: most recent
-- effective row wins, so this preserves the 3x rate for already-run payroll periods).
insert into policy_settings (org_id, setting_type, value, effective_date)
values (
  '00000000-0000-0000-0000-000000000001',
  'ot_rate',
  '{"normal":1,"holiday":1}'::jsonb,
  current_date
)
on conflict do nothing;
