-- Nineall HR — let a super_admin edit an existing administrator account (name, login
-- email, role, and optionally reset the password) from the /admins page. Previously
-- that page could only list and create admins, not edit one afterward.
--
-- Email is kept in sync between public.profiles.email (what lookup_login_email
-- matches against) and auth.users.email (what Supabase Auth actually authenticates
-- against) — editing only one would silently break that admin's login.
-- Also refuses to demote the last remaining super_admin, so the org can't be left
-- with zero accounts able to reach this page again.

create or replace function public.update_admin_account(
  p_profile_id uuid,
  p_full_name text,
  p_email text,
  p_role text,
  p_new_password text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org_id uuid;
begin
  if current_user_role() != 'super_admin' then
    raise exception 'FORBIDDEN: only super_admin can edit administrator accounts';
  end if;

  if p_role not in ('super_admin', 'hr', 'manager') then
    raise exception 'INVALID_ROLE: % is not a valid administrator role', p_role;
  end if;

  select org_id into v_org_id from profiles where id = p_profile_id;
  if v_org_id is null or v_org_id != current_org_id() then
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
$$;

revoke all on function public.update_admin_account(uuid, text, text, text, text) from public;
grant execute on function public.update_admin_account(uuid, text, text, text, text) to authenticated;
