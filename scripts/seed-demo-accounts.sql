-- Nineall HR — create the 4 demo login accounts directly via SQL.
--
-- Why this exists alongside scripts/seed-demo-accounts.mjs: that script needs
-- SUPABASE_SERVICE_ROLE_KEY, which the account owner could not retrieve in
-- session 2 (couldn't access the Supabase account that owns this project).
-- This script creates the same 4 accounts by inserting directly into
-- auth.users/auth.identities (bcrypt-hashing the password with pgcrypto) and
-- public.profiles, bypassing the Admin API entirely. Run via the Supabase
-- SQL Editor, or via the Supabase MCP execute_sql tool.
--
-- DEV/DEMO ONLY. Never run against a production project. Every account has
-- must_change_password = true, so this password is forced to be changed on
-- first login anyway.
--
-- Safe to re-run: every insert has ON CONFLICT DO NOTHING.

do $$
declare
  accounts jsonb := '[
    {"uid":"00000000-0000-0000-0000-0000000a0001","email":"admin@nineallgroup.co.th","role":"super_admin","emp":"00000000-0000-0000-0000-000000010001","name":"สมชาย ใจดี"},
    {"uid":"00000000-0000-0000-0000-0000000a0002","email":"hr@nineallgroup.co.th","role":"hr","emp":"00000000-0000-0000-0000-000000010002","name":"กัญญาวีร์ สมใจ"},
    {"uid":"00000000-0000-0000-0000-0000000a0003","email":"manager@nineallgroup.co.th","role":"manager","emp":"00000000-0000-0000-0000-000000010003","name":"ธนภูมิ ใจดี"},
    {"uid":"00000000-0000-0000-0000-0000000a0004","email":"employee@nineallgroup.co.th","role":"employee","emp":"00000000-0000-0000-0000-000000010004","name":"วิภาวรรณ แสงทิพย์"}
  ]';
  acct jsonb;
  uid uuid;
begin
  for acct in select * from jsonb_array_elements(accounts) loop
    uid := (acct->>'uid')::uuid;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      is_sso_user, is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      acct->>'email', crypt('NineallDemo2026!', gen_salt('bf')), now(),
      now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      '', '', '', '',
      false, false
    )
    on conflict (id) do nothing;

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), uid::text, uid,
      jsonb_build_object('sub', uid::text, 'email', acct->>'email', 'email_verified', true),
      'email', now(), now(), now()
    )
    on conflict (provider_id, provider) do nothing;

    insert into public.profiles (
      id, org_id, employee_id, role, full_name, email, must_change_password, is_active, preferred_language
    ) values (
      uid, '00000000-0000-0000-0000-000000000001', (acct->>'emp')::uuid,
      (acct->>'role')::user_role, acct->>'name', acct->>'email', true, true, 'th'
    )
    on conflict (id) do nothing;
  end loop;
end $$;
