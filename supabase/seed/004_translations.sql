-- Nineall HR — seed: a starter set of translation keys for the Translation Management screen.
-- Safe to re-run: every insert uses a fixed UUID + ON CONFLICT DO NOTHING.
-- Covers app-chrome strings already hardcoded in admin-web/employee-mobile today, so the
-- screen has real rows to demonstrate search/filter/missing-translation flagging against —
-- not fake employee data (translation strings are configuration, not PII).

insert into translation_keys (id, org_id, key, description) values
  ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000001', 'login_button', 'Login screen submit button'),
  ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000001', 'check_in_label', 'Attendance: clock-in action label'),
  ('00000000-0000-0000-0000-000000000903', '00000000-0000-0000-0000-000000000001', 'check_out_label', 'Attendance: clock-out action label'),
  ('00000000-0000-0000-0000-000000000904', '00000000-0000-0000-0000-000000000001', 'nav_home', 'Mobile bottom nav: Home'),
  ('00000000-0000-0000-0000-000000000905', '00000000-0000-0000-0000-000000000001', 'nav_leave', 'Mobile bottom nav: Leave'),
  ('00000000-0000-0000-0000-000000000906', '00000000-0000-0000-0000-000000000001', 'nav_salary', 'Mobile bottom nav: Payslip'),
  ('00000000-0000-0000-0000-000000000907', '00000000-0000-0000-0000-000000000001', 'leave_balance_label', 'Home dashboard: remaining leave days stat'),
  ('00000000-0000-0000-0000-000000000908', '00000000-0000-0000-0000-000000000001', 'pending_approval_label', 'Home dashboard: pending requests stat')
on conflict (id) do nothing;

insert into translations (translation_key_id, locale, value) values
  ('00000000-0000-0000-0000-000000000901', 'th', 'เข้าสู่ระบบ'),
  ('00000000-0000-0000-0000-000000000901', 'en', 'Login'),
  ('00000000-0000-0000-0000-000000000901', 'lo', 'ເຂົ້າສູ່ລະບົບ'),
  -- Burmese deliberately left unseeded here to demonstrate the "missing translation" flag.

  ('00000000-0000-0000-0000-000000000902', 'th', 'ลงเวลาเข้างาน'),
  ('00000000-0000-0000-0000-000000000902', 'en', 'Check In'),
  ('00000000-0000-0000-0000-000000000902', 'lo', 'ລົງເວລາເຂົ້າວຽກ'),
  ('00000000-0000-0000-0000-000000000902', 'my', 'အလုပ်ဝင်ချိန်မှတ်'),

  ('00000000-0000-0000-0000-000000000903', 'th', 'ลงเวลาออกงาน'),
  ('00000000-0000-0000-0000-000000000903', 'en', 'Check Out'),
  ('00000000-0000-0000-0000-000000000903', 'lo', 'ລົງເວລາອອກວຽກ'),
  ('00000000-0000-0000-0000-000000000903', 'my', 'အလုပ်ဆင်းချိန်မှတ်'),

  ('00000000-0000-0000-0000-000000000904', 'th', 'หน้าแรก'),
  ('00000000-0000-0000-0000-000000000904', 'en', 'Home'),
  ('00000000-0000-0000-0000-000000000904', 'lo', 'ໜ້າຫຼັກ'),
  ('00000000-0000-0000-0000-000000000904', 'my', 'ပင်မစာမျက်နှာ'),

  ('00000000-0000-0000-0000-000000000905', 'th', 'ลางาน'),
  ('00000000-0000-0000-0000-000000000905', 'en', 'Leave'),
  -- Lao and Burmese deliberately left unseeded for this key.

  ('00000000-0000-0000-0000-000000000906', 'th', 'เงินเดือน'),
  ('00000000-0000-0000-0000-000000000906', 'en', 'Salary'),
  ('00000000-0000-0000-0000-000000000906', 'lo', 'ເງິນເດືອນ'),
  ('00000000-0000-0000-0000-000000000906', 'my', 'လစာ'),

  ('00000000-0000-0000-0000-000000000907', 'th', 'วันลาคงเหลือ'),
  ('00000000-0000-0000-0000-000000000907', 'en', 'Leave Balance'),
  ('00000000-0000-0000-0000-000000000907', 'lo', 'ວັນລາທີ່ເຫຼືອ'),
  ('00000000-0000-0000-0000-000000000907', 'my', 'ကျန်ရှိခွင့်ရက်'),

  ('00000000-0000-0000-0000-000000000908', 'th', 'คำขอรออนุมัติ'),
  ('00000000-0000-0000-0000-000000000908', 'en', 'Pending Approval')
  -- Lao and Burmese deliberately left unseeded for this key.
on conflict (translation_key_id, locale) do nothing;
