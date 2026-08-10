
-- Login screen accepts "Email / Employee ID" (master prompt section 17, login screen). Since RLS
-- blocks unauthenticated reads of profiles/employees (correctly), this narrowly-scoped function lets
-- the pre-auth login form resolve an employee_code to its login email — it returns nothing else.
create or replace function public.lookup_login_email(p_identifier text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select email from profiles where lower(email) = lower(p_identifier) and is_active limit 1),
    (
      select p.email
      from profiles p
      join employees e on e.id = p.employee_id
      where lower(e.employee_code) = lower(p_identifier) and p.is_active
      limit 1
    )
  );
$$;

revoke all on function public.lookup_login_email(text) from public;
grant execute on function public.lookup_login_email(text) to anon, authenticated;
