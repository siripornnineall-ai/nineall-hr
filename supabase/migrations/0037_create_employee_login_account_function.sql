-- Nineall HR — create an employee's login account without the Supabase service-role
-- key. The previous flow called admin.auth.admin.createUser() from the server action,
-- which requires SUPABASE_SERVICE_ROLE_KEY to be set correctly in the deployed
-- environment — a key this project's owner has never had reliable access to (the local
-- .env.local literally has a placeholder value, and in production the same
-- symptom showed up: employees got created but zero matching auth.users rows ever
-- appeared, meaning createUser() was failing every time, silently from the HR user's
-- point of view since the employee record itself still saved).
--
-- This mirrors the exact same direct-SQL pattern already used successfully in this
-- project (scripts/seed-demo-accounts.sql) and the security-definer style of
-- offboard_employee/delete_employee: insert straight into auth.users/auth.identities
-- with a securely random, never-shared password (the employee sets their own via the
-- existing resetPasswordForEmail flow, which only needs the anon key and already works).

create or replace function public.create_employee_login_account(
  p_employee_id uuid,
  p_email text,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org_id uuid;
  v_new_id uuid := gen_random_uuid();
begin
  if not is_admin_or_hr() then
    raise exception 'FORBIDDEN: only super_admin/hr can create a login account';
  end if;

  select org_id into v_org_id from employees where id = p_employee_id and org_id = current_org_id();
  if v_org_id is null then
    raise exception 'EMPLOYEE_NOT_FOUND';
  end if;

  if exists (select 1 from auth.users where email = p_email) then
    raise exception 'EMAIL_ALREADY_USED: % is already registered', p_email;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', v_new_id, 'authenticated', 'authenticated',
    p_email, crypt(encode(gen_random_bytes(24), 'base64'), gen_salt('bf')), now(),
    now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', '',
    false, false
  );

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_new_id::text, v_new_id,
    jsonb_build_object('sub', v_new_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.profiles (
    id, org_id, employee_id, role, full_name, email, must_change_password, is_active
  ) values (
    v_new_id, v_org_id, p_employee_id, 'employee', p_full_name, p_email, true, true
  );

  return v_new_id;
end;
$$;

revoke all on function public.create_employee_login_account(uuid, text, text) from public;
grant execute on function public.create_employee_login_account(uuid, text, text) to authenticated;
