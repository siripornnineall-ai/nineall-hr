-- Security fix: create_admin_account / update_admin_account used
-- `current_user_role() != 'super_admin'` as their authorization guard.
-- In PL/pgSQL, `NULL != 'super_admin'` evaluates to NULL, and `IF NULL THEN`
-- is treated as false (the RAISE EXCEPTION never runs) — so an unauthenticated
-- (anon) caller, for whom current_user_role() resolves to NULL, was never
-- rejected by this check and execution continued into the account-creation
-- logic. create_admin_account was only saved from actually persisting a row
-- by an unrelated NOT NULL constraint on profiles.org_id; update_admin_account
-- had no such accidental safety net and could be used by an anonymous caller
-- to overwrite the email/password/role of any existing admin profile whose id
-- they knew. Fixed by switching to `IS DISTINCT FROM`, which correctly treats
-- a NULL role as not equal to 'super_admin', plus explicit NULL guards on the
-- resolved org id in both functions.

create or replace function public.create_admin_account(p_email text, p_full_name text, p_password text, p_role text, p_employee_id uuid default null::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org_id uuid;
  v_new_id uuid := gen_random_uuid();
begin
  if current_user_role() is distinct from 'super_admin' then
    raise exception 'FORBIDDEN: only super_admin can create administrator accounts';
  end if;

  if p_role not in ('super_admin', 'hr', 'manager') then
    raise exception 'INVALID_ROLE: % is not a valid administrator role', p_role;
  end if;

  if length(p_password) < 8 then
    raise exception 'PASSWORD_TOO_SHORT: password must be at least 8 characters';
  end if;

  v_org_id := current_org_id();
  if v_org_id is null then
    raise exception 'FORBIDDEN: no organization context for current user';
  end if;

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
$function$;

create or replace function public.update_admin_account(p_profile_id uuid, p_full_name text, p_email text, p_role text, p_new_password text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org_id uuid;
  v_caller_org_id uuid;
begin
  if current_user_role() is distinct from 'super_admin' then
    raise exception 'FORBIDDEN: only super_admin can edit administrator accounts';
  end if;

  if p_role not in ('super_admin', 'hr', 'manager') then
    raise exception 'INVALID_ROLE: % is not a valid administrator role', p_role;
  end if;

  v_caller_org_id := current_org_id();
  if v_caller_org_id is null then
    raise exception 'FORBIDDEN: no organization context for current user';
  end if;

  select org_id into v_org_id from profiles where id = p_profile_id;
  if v_org_id is null or v_org_id is distinct from v_caller_org_id then
    raise exception 'ACCOUNT_NOT_FOUND';
  end if;

  if p_role != 'super_admin' and (select role from profiles where id = p_profile_id) = 'super_admin'
     and (select count(*) from profiles where org_id = v_org_id and role = 'super_admin' and is_active) <= 1
  then
    raise exception 'LAST_SUPER_ADMIN: cannot change the role of the only remaining super_admin';
  end if;

  if p_email is distinct from (select email from profiles where id = p_profile_id) then
    if exists (select 1 from auth.users where email = p_email and id != p_profile_id) then
      raise exception 'EMAIL_ALREADY_USED: % is already registered', p_email;
    end if;
    update auth.users set email = p_email, updated_at = now() where id = p_profile_id;
  end if;

  if p_new_password is not null and length(p_new_password) > 0 then
    if length(p_new_password) < 8 then
      raise exception 'PASSWORD_TOO_SHORT: password must be at least 8 characters';
    end if;
    update auth.users set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')), updated_at = now()
      where id = p_profile_id;
  end if;

  update profiles set full_name = p_full_name, email = p_email, role = p_role::user_role
    where id = p_profile_id;
end;
$function$;
