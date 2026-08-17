-- Nineall HR — 2026 SSO wage-base increase (max base 15,000 -> 17,500 THB,
-- max monthly contribution 750 -> 875 THB at the unchanged 5% employee rate).
-- Effective-dated policy: never edit the old row, close it and insert the new one
-- so payroll runs already locked under the old rate keep using it.

update policy_settings
set end_date = '2026-08-16'
where setting_type = 'social_security' and effective_date = '2026-01-01' and end_date is null;

insert into policy_settings (org_id, setting_type, value, effective_date, requires_expert_review, notes)
select o.id, 'social_security',
  '{"employeeRate": 0.05, "minBaseSatang": 165000, "maxContributionSatang": 87500}'::jsonb,
  '2026-08-17', false, 'ปรับตามฐานค่าจ้างประกันสังคมใหม่ (สูงสุด 17,500 บาท/เดือน, จ่ายสูงสุด 875 บาท)'
from organizations o
on conflict (org_id, setting_type, effective_date) do nothing;
