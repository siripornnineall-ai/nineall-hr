-- The row-level-security policies on the big tables called current_org_id() / is_admin_or_hr() / current_employee_id()
-- once PER ROW (they are SECURITY DEFINER, so Postgres cannot inline or hoist them). Reading a year of attendance
-- (4,725 rows) took 1-4 s and several at once made the "รายงานสรุป" page time out (owner 2026-11-10). Wrapping them in
-- (select ...) makes Postgres evaluate each once per statement: same rules, same results, now ~2 ms for that read.
-- Applies to: attendance_records, shift_assignments, leave_requests, leave_balances, overtime_requests, employees.
set local lock_timeout = '5s';
do $$
declare
  p record;
  v_using text;
  v_check text;
  v_sql text;
  v_fn text;
begin
  for p in
    select pol.polname, c.relname,
           pg_get_expr(pol.polqual, pol.polrelid) as q,
           pg_get_expr(pol.polwithcheck, pol.polrelid) as wc
      from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('attendance_records', 'shift_assignments', 'leave_requests', 'leave_balances', 'overtime_requests', 'employees')
  loop
    v_using := p.q;
    v_check := p.wc;
    foreach v_fn in array array['current_org_id()', 'is_admin_or_hr()', 'current_employee_id()'] loop
      if v_using is not null and position('( SELECT ' || v_fn in v_using) = 0 then
        v_using := replace(v_using, v_fn, '( SELECT ' || v_fn || ' )');
      end if;
      if v_check is not null and position('( SELECT ' || v_fn in v_check) = 0 then
        v_check := replace(v_check, v_fn, '( SELECT ' || v_fn || ' )');
      end if;
    end loop;
    if v_using is distinct from p.q or v_check is distinct from p.wc then
      v_sql := format('alter policy %I on public.%I', p.polname, p.relname)
               || coalesce(' using (' || v_using || ')', '')
               || coalesce(' with check (' || v_check || ')', '');
      execute v_sql;
    end if;
  end loop;
end $$;
