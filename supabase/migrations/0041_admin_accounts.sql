-- Nineall HR — let a super_admin view and add other administrator accounts
-- (super_admin / hr / manager) from the admin-web UI. Previously there was no way to
-- do this at all short of direct SQL. Mirrors create_employee_login_account's
-- security-definer pattern (no service-role key needed, admin types the initial
-- password directly instead of emailing a link) but restricted to super_admin only,
-- since minting new administrator accounts is more sensitive than adding an employee.

create or replace function public.create_admin_account(
  p_email text,
  p_full_name text,
  p_password text,
  p_role text,
  p_employee_id uuid default null
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
  if current_user_role() != 'super_admin' then
    raise exception 'FORBIDDEN: only super_admin can create administrator accounts';
  end if;

  if p_role not in ('super_admin', 'hr', 'manager') then
    raise exception 'INVALID_ROLE: % is not a valid administrator role', p_role;
  end if;

  if length(p_password) < 8 then
    raise exception 'PASSWORD_TOO_SHORT: password must be at least 8 characters';
  end if;

  v_org_id := current_org_id();

  if exists (select 1 from auth.users where email = p_email) then
    raise exception 'EMAIL_ALREADY_USED: % is already registered', p_email;
  end if;

  if p_employee_id is not null and not exists (select 1 from employees where id = p_employee_id and org_id = v_org_id) then
    raise exception 'EMPLOYEE_NOT_FOUND';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', v_new_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
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
    v_new_id, v_org_id, p_employee_id, p_role::user_role, p_full_name, p_email, true, true
  );

  return v_new_id;
end;
$$;

revoke all on function public.create_admin_account(text, text, text, text, uuid) from public;
grant execute on function public.create_admin_account(text, text, text, text, uuid) to authenticated;
